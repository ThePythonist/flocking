socket = io("http://localhost:3000");
var room;

socket.on("connect", function() {
	console.log("connected");
	let parts = window.location.href.split("?room=");
	room = parts[parts.length-1];

	socket.emit("whichpage", room);

	socket.on("page", function(_room, name) {
		if (_room === room) {
			attempt(name);
		}
	});
});

function attempt(name) {
	try {
		let pages = window.inst.getPages();
		for (let page of pages) {
			if (page[0] !== name) {
				page[1].remove();
			}
		}
	} catch {
		setTimeout(()=>{attempt(name);}, 10);
	}
}