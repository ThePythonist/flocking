socket = io("http://localhost:3000");
var room;

socket.on("connect", function() {
	console.log("connected");

	let parts = window.location.href.split("?room=");
	room = parts[parts.length-1];

	socket.on("sendpage", function(_room) {
		if (_room === room) {
			let pageNo = $("#pageNumber").val() - 1;
			let page = window.inst.getPages()[pageNo][0];
			socket.emit("onpage", room, page);
		}
	});
});