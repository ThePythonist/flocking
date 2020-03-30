const url = "http://86.169.164.85";
var socket = io(url+":3000");

var data;

socket.on("connect", function () {
	refresh();
});

socket.on("sessions", function(_data) {
	data = _data;
	let tbody = $("tbody").html("");
	for (let room in data) {
		tbody.append(`<tr><td>${room}</td><td><select id="${room}"></select><td><td><button id="${room}-button">Restore</button></td></tr>`);
		let select = $(`#${room}`);
		for (let time in data[room]) {
			select.append(`<option value="${time}">${time}</option>`);
		}
		$(`#${room}-button`).on("click", function() {restore(room)});
	}
});

function restore(room) {
	socket.emit("deleteRoom", room);
	socket.emit("newRoom", room);
	let time = $(`#${room}`).children("option:selected").val();
	for (let wb of data[room][time]) {
		socket.emit("updateWhiteboard", room, wb);
	}
}

function refresh() {
	socket.emit("sessions");
}

function deleteAll() {
	if (confirm("Are you sure? All sessions will be lost and irrecoverable.")) {
		socket.emit("deleteAll");
	}
}