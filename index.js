const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const siofu = require("socketio-file-upload");
const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3').verbose();

const backupEvery = 5 * 60 * 1000
const storeBackupsFor = 6 * 3600;


const filePath = path.join(__dirname, "files");

app.use(siofu.router);

var data = {};

function saveRoom(db, name, id) {
	db.run("INSERT INTO sessions(room, timeCreated) VALUES (?, strftime('%s','now'))", [id], function (err) {
		if (err) {
			console.log(err.message);
		} else {
			let sessID = this.lastID;
			for (wb of data[name].whiteboards) {
				db.run("INSERT INTO whiteboards(session, idInRoom, x, y, page, size, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
					   [sessID, wb.id, wb.x, wb.y, wb.page, wb.size, wb.text],
					   function (err) {
					if (err) {
						console.log(err.message);
					}
				});
			}
		}
	})
}

function backup() {
	console.log("backing up");
	let db = new sqlite3.Database("./backup.db", function(err) {
		if (err) {
			console.log(err.message);
		}
		console.log("connected to backup database");
	});

	for (let name in data) {
		db.all("SELECT id FROM rooms WHERE name=?", [name], function (err, rows) {
			if (rows.length === 0) {
				db.run("INSERT INTO rooms(name) VALUES (?)", [name], function (err) {
					if (err) {
						console.log(err.message);
					} else {
						saveRoom(db, name, this.lastID);
					}
				});
			} else {
				saveRoom(db, name, rows[0].id);
			}
		});
	}

	let query = `
DELETE FROM sessions WHERE strftime('%s','now')-timeCreated > ?;
DELETE FROM whiteboards WHERE session NOT IN (SELECT id FROM sessions);
DELETE FROM rooms WHERE id NOT IN (SELECT room FROM sessions);`;

	db.run(query, [storeBackupsFor], function(err) {
		if (err) {
			console.log(err.message);
		}
	})

	db.close(function (err) {
		if (err) {
			console.error(err.message);
		}
		console.log('database connection closed');
	});

	setTimeout(backup, backupEvery);
}

function createRoom(name) {
	data[name] = {playing: false,
				  paused: false,
				  page: null,
				  bg: null,
				  whiteboards: []};
}

function startRoom(name) {
	let room = data[name];
	room.playing ^= 1;
		if (room.playing) {
			console.log(`play room ${name}`);
			io.emit("play", name);
		} else {
			console.log(`stop room ${name}`);
			io.emit("stop", name);
			room.paused = false;
			room.whiteboards = [];
		}
}

io.on("connection", function(socket){
	console.log("new connection: "+socket.id);

	var uploader = new siofu();
	uploader.dir = filePath;
	uploader.listen(socket);
	

	socket.on("entry", function (name) {
		if (name in data) {
			console.log(`entry to room ${name}`);
			if (data[name].playing) {
				socket.emit("play", name);
			} else {
				socket.emit("stop", name);
			}

			if (data[name].paused) {
				socket.emit("pause", name);
			} else {
				socket.emit("unpause", name);
			}

			for (let whiteboard of data[name].whiteboards) {
				socket.emit("updatedWhiteboard", name, whiteboard);
			}
		}
	});
	
	socket.on("data", function (dataMsg) {
		if (dataMsg.room in data) {
			dataMsg.id = socket.id;
			io.emit("data", dataMsg);
			if (data[dataMsg.room].playing) {
				socket.emit("play", dataMsg.room);
			}
		}
	});

	socket.on("pause", function(name) {
		if (name in data) {
			if (data[name].paused) {
				console.log(`unpause room ${name}`);
				data[name].paused = false;
				io.emit("unpause", name);
			} else {
				console.log(`pause room ${name}`);
				data[name].paused = true;
				io.emit("pause", name);
			}
		}
	});
	
	socket.on("start", function(name) {
		if (name in data) {
			startRoom(name);
		}
	});

	socket.on("whichpage", function (name) {
		if (name in data) {
			socket.emit("page", name, data[name].page);
		}
	});

	socket.on("sendpage", function(name, filename) {
		if (name in data) {
			console.log(`send page ${name} - ${filename}`);
			data[name].bg = filename;
			socket.broadcast.emit("sendpage", name);
			fs.readdir(filePath, function (err, files) {
				if (err) {
					return console.log("Unable to scan directory: " + err);
				} 
				files.forEach(function (file) {
					let found = false;
					for (let name in data) {
						if (file === data[name].bg) {
							found = true;
							break;
						}
					}
					if (!found) {
						console.log(`unlinking ${file}`);
						fs.unlink(path.join(filePath, file), function (){});
					}
				});
			});
		}
	});

	socket.on("onpage", function(name, _page) {
		if (name in data) {
			data[name].page = _page;
			console.log(`on page ${data[name].page} in room ${name}`);
			io.emit("background", name, data[name].bg);
		}
	});

	socket.on("background", function(name) {
		if (name in data) {
			socket.emit("background", name, data[name].bg);
		}
	});

	socket.on("rmbg", function(name) {
		if (name in data) {
			console.log(`removed background on room ${name}`);
			data[name].bg = null;
			data[name].page = null;
			io.emit("background", name, null);
		}
	})

	socket.on("rooms", function() {
		socket.emit("rooms", Object.keys(data));
	});

	socket.on("newRoom", function(name) {
		console.log(`room created: ${name}`);
		createRoom(name);
		io.emit("rooms", Object.keys(data));
	});

	socket.on("deleteRoom", function(name) {
		console.log(`room deleted: ${name}`);
		if (name in data) {
			delete data[name];
			io.emit("rooms", Object.keys(data));
			io.emit("roomDeleted", name);
		}
		if (name === "default") {
			createRoom("default")
		}
	});

	socket.on("deleteAllRooms", function() {
		console.log("all rooms deleted");
		for (let name of Object.keys(data)) {
			if (name !== "default") {
				delete data[name];
				io.emit("roomDeleted", name);
			}
		}
		io.emit("rooms", Object.keys(data));

	});

	socket.on("updateWhiteboard", function(name, wbData) {
		if (name in data) {
			// console.log(`whiteboard updated in ${name}`);
			let room = data[name];
			let updated;
			if (wbData.id !== "" && wbData.id !== -1) {
				let found = false;
				for (let wb of room.whiteboards) {
					if (wb.id === wbData.id) {
						wb.x = wbData.x;
						wb.y = wbData.y;
						wb.text = wbData.text;
						wb.size = wbData.size;
						wb.page = wbData.page;
						updated = wb;
						found = true;
						break;
					}
				}
				if (!found) {
					updated = {id: wbData.id,
						   	   x: wbData.x,
						   	   y: wbData.y,
						   	   text: wbData.text,
						   	   size: wbData.size,
						   	   page: wbData.page};
					room.whiteboards.push(updated);
				}
			} else {
				let nextID = 0;
				let found = true;
				while (found) {
					found = false;
					for (let wb of room.whiteboards) {
						if (wb.id === nextID) {
							nextID++;
							found = true;
							break;
						}
					}
				}
				updated = {id: nextID,
						   x: wbData.x,
						   y: wbData.y,
						   text: "",
						   size: wbData.size,
						   page: wbData.page};
				room.whiteboards.push(updated);
			}
			socket.emit("whiteboardIs", updated.id);
			socket.broadcast.emit("updatedWhiteboard", name, updated);
		}
	});

	socket.on("removeWhiteboard", function(name, id) {
		if (name in data) {
			console.log(`whiteboard removed in ${name}`);
			let room = data[name];
			for (let i=0; i<room.whiteboards.length; i++) {
				if (room.whiteboards[i].id === id) {
					room.whiteboards.splice(i, 1);
					io.emit("removedWhiteboard", name, id);
					break;
				}
			}
		}
	});

	socket.on("deleteAll", function () {
		console.log("deleting all sessions");
		let db = new sqlite3.Database("./backup.db", function(err) {
			if (err) {
				console.log(err.message);
			}
			console.log("connected to backup database");
		});

		db.run("DELETE FROM rooms", [], function(err) {
			if (err) {
				console.log(err.message);
			}
		});

		db.run("DELETE FROM sessions", [], function(err) {
			if (err) {
				console.log(err.message);
			}
		});

		db.run("DELETE FROM whiteboards", [], function(err) {
			if (err) {
				console.log(err.message);
			}
		});

		db.close(function (err) {
			if (err) {
				console.error(err.message);
			}
			console.log('database connection closed');
		});


		socket.emit("sessions", {});
	});

	socket.on("sessions", function() {
		console.log("requesting sessions");
		let db = new sqlite3.Database("./backup.db", function(err) {
			if (err) {
				console.log(err.message);
			}
			console.log("connected to backup database");
		});

		let query = `
SELECT name, datetime(timeCreated,'unixepoch') AS t, idInRoom, x, y, size, page, data
FROM rooms
INNER JOIN sessions on room = rooms.id
INNER JOIN whiteboards on session = sessions.id
ORDER BY timeCreated DESC;
		`;
		db.all(query, [], function (err, rows) {
			sessData = {};
			if (err) {
				console.log(err.message);
			} else {
				for (let row of rows) {
					if (!(row.name in sessData)) {
						sessData[row.name] = {};
					}
					if (!(row.t in sessData[row.name])) {
						sessData[row.name][row.t] = [];
					}
					sessData[row.name][row.t].push({id: row.idInRoom,
											 		x: row.x,
											 		y: row.y,
											 		size: row.size,
											 		page: row.page,
											 		text: row.data});
				}
				socket.emit("sessions", sessData);
			}
		});

		db.close(function (err) {
			if (err) {
				console.error(err.message);
			}
			console.log('database connection closed');
		});
	});
});

app.use("/ViewerJS", express.static(path.join(__dirname, "ViewerJS")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/files", express.static(path.join(__dirname, "files")));
app.get("/client-*", function(req, res) {
	let room = req.params["0"];
	if (room in data) {
		res.sendFile(path.join(__dirname, "index.html"));
	} else {
		res.send("This room does not exist. Please ask the facilitator for clarification.");
	}
});
app.get("/facilitator", function(req, res) {
	res.sendFile(path.join(__dirname, "facilitator.html"));
});

app.get("/restore", function(req, res) {
	res.sendFile(path.join(__dirname, "restore.html"));
});

http.listen(3000, function(){
	console.log("listening on *:3000");
});

app.listen(8080, function() {
	console.log("listening on *:8080");
});

process.on('uncaughtException', function (err) {
	console.log('UNCAUGHT EXCEPTION - keeping process alive:', err); // err.message is "foobar"
});


createRoom("default");
backup();