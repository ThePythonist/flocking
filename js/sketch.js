let stage = "loading";
let x, y;
let button;
let pauseButton;
let name = "";
let input;
let paused = false;
let r = 255;
let g = 0;
let b = 0;
let h;
let s;
let v;
let rooms;
let loadingTime = -Infinity;
let writingOn = null;
let room;
let loaded = false;
let dragging = null;
p5.disableFriendlyErrors = true;
const url = "http://86.169.164.85";
var socket = io(url+":3000");
var bgfilename = null;
var whiteboards = [];

function HSVtoRGB(h, s, v) {
		var r, g, b, i, f, p, q, t;
		if (arguments.length === 1) {
				s = h.s, v = h.v, h = h.h;
		}
		i = Math.floor(h * 6);
		f = h * 6 - i;
		p = v * (1 - s);
		q = v * (1 - f * s);
		t = v * (1 - (1 - f) * s);
		switch (i % 6) {
				case 0: r = v, g = t, b = p; break;
				case 1: r = q, g = v, b = p; break;
				case 2: r = p, g = v, b = t; break;
				case 3: r = p, g = q, b = v; break;
				case 4: r = t, g = p, b = v; break;
				case 5: r = v, g = p, b = q; break;
		}
		return {
				r: Math.round(r * 255),
				g: Math.round(g * 255),
				b: Math.round(b * 255)
		};
}

const radius = 20;
const FPS = 40;

let others = {};

socket.on("connect", function () {
	$("#renderwhiteboards").on("click", renderWhiteboards);
	if (participating) {
		let parts = window.location.href.split("/client-");
		room = parts[parts.length-1];
		socket.emit("entry", room);
		setInterval(function () {
			if (stage !== "loading") {
				emitMe();
			}
		}, 1000 / FPS);
		socket.emit("background", room);
		socket.on("roomDeleted", function(_room) {
			if (_room === room) {
				$("body").html("This room has been deleted. Please ask the facilitator for clarification.");
			}
		});
		
	} else {
		socket.emit("rooms");
		socket.on("rooms", function(_rooms) {
			rooms = _rooms;
			$("#rooms").html("");
			for (let r of rooms) {
				$("#rooms").append(`<option id=${r} val=${r}>${r}</option>`);
			}
			$("#rooms").append("<option id='newRoom'>[Create new room]</option>");
			if (room) {
				if ($("#rooms").children(`option#${room}`).length === 0) {
					room = "default";
					others = {};
					whiteboards = [];
					$("#renderwhiteboards").addClass("hide");
					bgfilename = null;
					$("#background").remove();
					socket.emit("entry", room);
					socket.emit("background", room);
					changeLink();
				}
				$("#rooms").val(room);

			}
			if (!loaded) {
				loaded = true;
				room = rooms[0];
				roomChange();
				$("#rooms").on("change", roomChange);
				socket.emit("entry", room);
				var uploader = new SocketIOFileUpload(socket);
				uploader.listenOnSubmit(document.getElementById("submitodp"), document.getElementById("odpfile"));

				var filename;

				uploader.addEventListener("load", function(event) {
					filename = event.name + ".odp";
				});

				uploader.addEventListener("complete", function(event) {
					console.log("uploaded");
					$("#myFrame").remove();
					$('<iframe>', {src: url+":8080"+"/ViewerJS/#../files/"+filename+"?room="+room,
									 id:	"myFrame",
									 width: ""+width,
									 height: ""+height,
									 }).appendTo('#iframeCell');
					$("#setBG").on('click', function () {
						socket.emit("sendpage", room, filename);
					});
				});
				$("#removeBG").on("click", function() {
					socket.emit("rmbg", room);
				});
				$("#deleteRoom").on("click", function() {
					if (room === "default") {
						alert("You can't delete the default room.");
					} else if (confirm("Are you sure you want to do that? All the clients on this room will be kicked off") === true) {
						let oldRoom = room;
						others = {};
						whiteboards = [];
						$("#renderwhiteboards").addClass("hide");
						socket.emit("deleteRoom", oldRoom);
					}
				})
				$("#deleteAllRooms").on("click", function() {
					if (confirm("Are you sure you want to do that? All clients on all rooms (except 'default') will be kicked off") === true) {
						others = {};
						whiteboards = [];
						$("#renderwhiteboards").addClass("hide");
						socket.emit("deleteAllRooms");
					}
				})
				socket.emit("background", room);
			}
		});
	}
	
});

socket.on("background", function(_room, filename) {
	if (_room === room) {
		if (bgfilename === null) {
			if (filename !== null) {
				bgfilename = filename;
				$('<iframe>', {src: url+":8080"+"/ViewerJS/protected.html#../files/"+filename+"?room="+room,
								 id:	"background",
								 width: ""+width,
								 height: ""+height}).appendTo('#canvasCell');
			}
		} else if (bgfilename !== filename) {
			bgfilename = filename;
			if (filename === null) {
				$("#background").remove();
			} else {
				$("#background").attr("src", url+":8080"+"/ViewerJS/protected.html#../files/"+filename+"?room="+room);
			}
		} else {
			if (filename !== null) {
				$("#background").remove();
				$('<iframe>', {src: url+":8080"+"/ViewerJS/protected.html#../files/"+filename+"?room="+room,
								 id:	"background",
								 width: ""+width,
								 height: ""+height}).appendTo('#canvasCell');
			}
		}
	}
});

socket.on("data", function (data) {
	if (millis() - loadingTime > 1000) {
		if (data.room === room) {
			others[data.id] = data;
			others[data.id].time = millis();
		}
	}
});

socket.on("play", function (_room) {
	if (_room === room) {
		if (!participating || stage === "waiting") {
			stage = "playing";
		}
	}
});

socket.on("stop", function (_room) {
	if (_room === room) {
		stage = "loading";
		others = {};
		paused = false;
		whiteboards = [];
		$("#renderwhiteboards").addClass("hide");
		loadingTime = millis();
	}
});

socket.on("pause", function (_room) {
	if (_room === room) {
		paused = true;
	}
});

socket.on("unpause", function (_room) {
	if (_room === room) {
		paused = false;
	}
});

socket.on("updatedWhiteboard", function(_room, wbData) {
	if (_room === room) {
		$("#renderwhiteboards").removeClass("hide");
		let found = false;
		for (let wb of whiteboards) {
			if (wb.id === wbData.id) {
				wb.x = wbData.x;
				wb.y = wbData.y;
				wb.text = wbData.text;
				wb.size = wbData.size;
				wb.page = wbData.page;
				if (wb === writingOn) {
					$("#whiteboard").val(wb.text);
				}
				wb.calcOffset();
				found = true;
				break
			}
		}
		if (!found) {
			let newWb = new Whiteboard(wbData.id, wbData.x, wbData.y, wbData.size);
			newWb.text = wbData.text;
			newWb.page = wbData.page;
			whiteboards.push(newWb);
		}
	}
});

socket.on("removedWhiteboard", function(_room, id) {
	if (_room === room) {
		for (let i=0; i<whiteboards.length; i++) {
			if (whiteboards[i].id === id) {
				whiteboards.splice(i, 1);
			}
		}
		if (whiteboards.length === 0) {
			$("#renderwhiteboards").addClass("hide");
		}
	}
});

function randString(length=10) {
	 var result					 = '';
	 var characters			 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	 var charactersLength = characters.length;
	 for ( var i = 0; i < length; i++ ) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
	 }
	 return result;
}

function changeLink(){
	let link = window.location.href.split("/facilitator").slice(0, -1)+"/client-"+room;
	$("#link").html(link).attr("href", link);

}

function roomChange() {
	room = $("#rooms").children("option:selected").attr("id");
	if (room === "newRoom") {
		let valid = false;
		let prmpt = "Enter a name for your room:";
		let roomName = "";
		while (!valid) {
			roomName = window.prompt(prmpt, roomName);
			if (/^[A-za-z0-9\-]*$/.test(roomName) && roomName.length <= 255) {
				valid = true;
			} else {
				prmpt = "The room name can only contain letters, numerals, and hyphens (-)";
			}
		}
		roomName = roomName === null || roomName === "" ? "" : roomName + "-";
		room = roomName + randString();
		socket.emit("newRoom", room);
	}
	others = {};
	whiteboards = [];
	$("#renderwhiteboards").addClass("hide");
	bgfilename = null;
	$("#background").remove();
	socket.emit("entry", room);
	socket.emit("background", room);
	changeLink();
}

function emitMe() {
	socket.emit("data", {room:room,
						 name:name,
						 x:x,
						 y:y,
						 r:r,
						 g:g,
						 b:b});
}

function setup() {
	var canvas = createCanvas(1200, 600);
	loadingTime = millis();
	canvas.parent("canvasCell");
	$("#whiteboard").bind('input propertychange', write);
	if (participating) {
		input = createInput();
		input.attribute("placeholder", "Name");
		h = random(0, 1);
		s = random(0.5,1);
		v = random(0.7,1);
		let rgb = HSVtoRGB(h, s, v);
		r = rgb.r;
		g = rgb.g;
		b = rgb.b;
		input.parent("nameCell");
		input.elt.classList.add("highlight");
	} else {
		button = createButton();
		button.mousePressed(startExercise);
		button.parent("reset");
		pauseButton = createButton();
		pauseButton.mousePressed(pauseExercise);
		pauseButton.parent("pause");
	}
}

function startExercise() {
	socket.emit("start", room);
}

function pauseExercise() {
	socket.emit("pause", room);
}

function mouseReleased() {
	let blockFacilitator = false;
	if (0 <= mouseX && mouseX <= width) {
		if (0 <= mouseY && mouseY <= height) {
			for (let wb of whiteboards) {
				if (wb.open) {
					blockFacilitator = true;
					let dir = wb.getClicked();
					if (dir !== 0) {
						wb.page += dir;
						wb.page = constrain(wb.page, 0, wb.graphics.length-1);
						socket.emit("updateWhiteboard", room, {id: wb.id, x: wb.x, y: wb.y, size: wb.size, text: wb.text, page:wb.page});
						break;
					}
				}
			}
			if (participating) {
				if (stage === "loading") {
					stage = "waiting";
					x = mouseX;
					y = mouseY;
					emitMe();
				}
			}
		}
	}
	if (!participating) {
		overlayClick(blockFacilitator);
	}
}

window.addEventListener("keydown", function(e) {
		// space and arrow keys
		if([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1) {
			if (!$("input").is(":focus") && !$("textarea").is(":focus")) {
					e.preventDefault();
			}
		}
}, false);

function getCursorPosition(element) {
		var el = element.get(0);
		var pos = 0;
		if ('selectionStart' in el) {
				pos = el.selectionStart;
		} else if ('selection' in document) {
				el.focus();
				var Sel = document.selection.createRange();
				var SelLength = document.selection.createRange().text.length;
				Sel.moveStart('character', -el.value.length);
				pos = Sel.text.length - SelLength;
		}
		return pos;
}


function write() {
	let val = $("#whiteboard").val();
	let cursorPos = getCursorPosition($("#whiteboard"));
	let before = val.substr(0, cursorPos);
	writingOn.text = val;
	writingOn.cursorPos = cursorPos;
	writingOn.render();
	socket.emit("updateWhiteboard", room, {id: writingOn.id, x: writingOn.x, y: writingOn.y, size: writingOn.size, text: val, page:writingOn.page});
}

function draw() {
	clear();
	background("rgba(255, 255, 255, 0)");
	textAlign(CENTER, TOP);
	if (participating) {
		name = input.value();
		if (stage === "loading") {
			textSize(30);
			noStroke();
			fill(0);
			text("Click to place yourself in a random location", width/2, 10)
			textSize(20);
			text(name, mouseX, mouseY+radius);
			fill(r, g, b);
			stroke(0);
			strokeWeight(2);
			ellipse(mouseX, mouseY, radius, radius);
		} else if (stage === "waiting") {
			textSize(30);
			noStroke();
			fill(0);
			text("Waiting for the facilitator to start the exercise", width/2, 10)
		} else if (stage === "playing") {
			if (!paused) {
				let speed = 0.05 * deltaTime;
				if (!$("input").is(":focus") && !$("textarea").is(":focus")) {
					if (keyIsDown(LEFT_ARROW)) {
						x -= speed;
					} if (keyIsDown(RIGHT_ARROW)) {
						x += speed;
					} if (keyIsDown(UP_ARROW)) {
						y -= speed;
					} if (keyIsDown(DOWN_ARROW)) {
						y += speed;
					}
				}
			}

			x = constrain(x, 0, width);
			y = constrain(y, 0, height);
		}
	} else {
		if (stage === "waiting" || stage === "loading") {
			textSize(30);
			noStroke();
			fill(0);
			text("Waiting for the facilitator to start the exercise", width/2, 10)
		}
		if (stage === "playing") {
			button.html("Click to stop exercise");
		} else {
			button.html("Click to start exercise");
		}

		if (paused) {
			pauseButton.html("Click to unpause");
		} else {
			pauseButton.html("Click to pause");
		}
	}

	for (let whiteboard of whiteboards) {
		if (!whiteboard.open) {
			if (participating) {
				whiteboard.draw(x, y);
			} else if (dragging === null){
				whiteboard.draw(mouseX, mouseY);
			} else if (dragging !== whiteboard) {
				whiteboard.draw(-Infinity -Infinity);
			}
		}
	}

	for (let whiteboard of whiteboards) {
		if (whiteboard.open) {
			if (participating) {
				whiteboard.draw(x, y);
			} else if (dragging === null){
				whiteboard.draw(mouseX, mouseY);
			} else if (dragging !== whiteboard) {
				whiteboard.draw(-Infinity -Infinity);
			}
		}
	}

	if (dragging !== null) {
		dragging.draw(-Infinity, -Infinity);
	}

	for (var id in others) {
		let other = others[id];
		if (millis() - other.time < 5000) {
			noStroke();
			fill(0);
			textSize(20);
			text(other.name, other.x, other.y+radius);
			fill(other.r, other.g, other.b);
			stroke(0);
			strokeWeight(2);
			ellipse(other.x, other.y, radius, radius);
		}
	}

	if (stage === "playing" && paused) {
		textSize(30);
		noStroke();
		fill(0);
		text("The facilitator has paused the exercise", width/2, 10)
	}

	if (participating) {
		let found = false;
		for (let whiteboard of whiteboards) {
			if (whiteboard.isNear(x, y)) {
				found = true;
				$("#whiteboard").removeClass("hide");
				$("#tooltip").removeClass("hide");
				writingOn = whiteboard;
				$("#whiteboard").val(whiteboard.text);
				break;
			}
		}
		if (!found) {
			$("#whiteboard").addClass("hide");
			$("#tooltip").addClass("hide");
			writingOn = null;
		}
	} else {
		overlay();
	}
}

function renderWhiteboards() {
	var doc = new jsPDF("p", "mm", "a4");
	var docWidth = doc.internal.pageSize.getWidth();
	var docHeight = doc.internal.pageSize.getHeight();
	let pages = {};
	for (let wb of whiteboards) {
		if (wb.text !== "") {
			wb.render();
			pages[wb.id] = wb.graphics;
		}
	}
	doc.setDrawColor(0);
	doc.setFillColor(255);

	var today = new Date();
	var date = today.getDate()+'/'+(today.getMonth()+1)+'/'+today.getFullYear();
	var time = today.getHours() + ":" + today.getMinutes();
	var timestamp = time + " " + date;
	var dateTime = date+' '+time;

	let first = true;
	for (let i=0; i<whiteboards.length; i++) {
		if (i in pages) {
			doc.text(10, 20, "Whiteboard #"+(i+1));
			if (first) {
				doc.text(docWidth-10-doc.getTextWidth(timestamp), 20, timestamp);
				doc.text((docWidth-doc.getTextWidth(room))/2, 20, room);
			}
			first = false;
			elY = 25;
			for (let cv of pages[i]) {
				let size = map(cv.width, iconSize, min(height, width), docWidth/4, docWidth-20);
				if (elY + size > docHeight) {
					doc.addPage();
					doc.text(10, 20, "Whiteboard #"+(i+1)+" continued");
					elY = 25;
				}
				let imgData = cv.elt.toDataURL("image/jpeg", 1.0);
				doc.addImage(imgData, "JPEG", (docWidth-size)/2, elY, size, size);
				doc.rect((docWidth-size)/2, elY, size, size);
				elY += size + 5;
			}
			doc.addPage();
		}
	}
	doc.deletePage(doc.internal.getNumberOfPages());
	doc.save(room+"-whiteboards.pdf");
	$("#renderwhiteboards")[0].blur();
}

function setSelectionRange(input, selectionStart, selectionEnd) {
	if (input.setSelectionRange) {
		input.focus();
		input.setSelectionRange(selectionStart, selectionEnd);
	}
	else if (input.createTextRange) {
		var range = input.createTextRange();
		range.collapse(true);
		range.moveEnd('character', selectionEnd);
		range.moveStart('character', selectionStart);
		range.select();
	}
}

function setCaretToPos (input, pos) {
	setSelectionRange(input, pos, pos);
	input.blur()
	input.focus()

}

document.addEventListener('contextmenu', function (event) {
	if (0 <= mouseX && mouseX <= width && 0 <= mouseY && mouseY <= height) {
		event.preventDefault();
	}
});
