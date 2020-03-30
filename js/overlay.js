var whiteboardSize = 400;
var holding = new Whiteboard(-1, 0, 0, 0);

var pressX, pressY;
var dragOffsetX, dragOffsetY;
var lastValidX, lastValidY;
var dragIndex;

socket.on("whiteboardIs", function(id) {
	for (let wb of whiteboards) {
		if (wb.id === "") {
			wb.id = id;
			break;
		}
	}
})

function overlay() {
	holding.x = mouseX;
	holding.y = mouseY;
	holding.size = whiteboardSize;

	var helpCellData = "";

	if (dragging === null) {
		let hovering = false;
		for (let wb of whiteboards) {
			if (wb.isNear(mouseX, mouseY)) {
				hovering = true;
				wb.drawWireframe();
				helpCellData = "Press [ENTER] to "+(writingOn === null ? "edit.<br />Right click to delete.<br />Press +/- to resize." : "stop editing.");
			}
		}
		if (!hovering) {
			if (0 <= mouseX && mouseX <= width && 0 <= mouseY && mouseY <= height) {
				holding.draw(-Infinity, -Infinity, true);
			}
		}
	} else {
		let colliding = false;
		let desiredX = constrain(mouseX + dragOffsetX, iconSize/2, width-iconSize/2);
		let desiredY = constrain(mouseY + dragOffsetY, iconSize/2 + textSize(), height-iconSize/2);
		for (let wb of whiteboards) {
			if (wb !== dragging && abs(wb.x - desiredX) <= iconSize && abs(wb.y - desiredY) <= iconSize) {
				colliding = true;
				break;
			}
		}

		dragging.x = desiredX;
		dragging.y = desiredY;
		if (!colliding) {
			lastValidX = dragging.x;
			lastValidY = dragging.y;
		}
	}

	$("#helpCell").html(helpCellData);
}

function keyPressed() {
	let hovering = false;
	for (let wb of whiteboards) {
		if (wb.isNear(mouseX, mouseY)) {
			hovering = true;
			let newSize = wb.size;
			if (key === "=") {
				newSize += 20;
			} else if (key === "-") {
				newSize -= 20;
			} else if (keyCode === 13) { //Enter
				if (writingOn === null) {
					$("#whiteboard").removeClass("hide");
					$("#tooltip").removeClass("hide");
					$("#richTextButtons").removeClass("hide");
					writingOn = wb;
					$("#whiteboard").val(wb.text);
				} else {
					$("#whiteboard").addClass("hide");
					$("#tooltip").addClass("hide");
					$("#richTextButtons").addClass("hide");
					writingOn = null;
				}
			}
			newSize = constrain(newSize, iconSize, min(height, width));
			wb.size = newSize;
			wb.calcOffset();
			socket.emit("updateWhiteboard", room, {id: wb.id, x: wb.x, y: wb.y, text: wb.text, size: newSize, page: wb.page});
			break
		}
	}
	if (!hovering) {
		if (0 <= mouseX && mouseX <= width && 0 <= mouseY && mouseY <= height) {
			if (key === "=") {
				whiteboardSize += 20;
			} else if (key === "-") {
				whiteboardSize -= 20;
			}
			whiteboardSize = constrain(whiteboardSize, 20, min(height, width));
		}
	}
}

function mousePressed() {
	pressX = mouseX;
	pressY = mouseY;
	dragging = null;
	for (let i=0; i<whiteboards.length; i++) {
		let wb = whiteboards[i];
		if (abs(mouseX - wb.x) <= iconSize/2 && abs(mouseY - wb.y) <= iconSize/2) {
			dragging = wb;
			dragOffsetX = wb.x - mouseX;
			dragOffsetY = wb.y - mouseY
			dragIndex = i;
			break;
		}
	}

}

function overlayClick(isBlocked) {
	if (0 <= mouseX && mouseX <= width && 0 <= mouseY && mouseY <= height) {
		if (dragging === null && !isBlocked) {
			let collides = false;
			if (mouseY <= iconSize/2 + textSize()) {
				collides = true;
			} else {
				for (let wb of whiteboards) {
					if (abs(wb.x - mouseX) <= iconSize && abs(wb.y - mouseY) <= iconSize) {
						collides = true;
						break;
					}
				}
			}
			if (!collides) {
				socket.emit("updateWhiteboard", room, {id: -1, x: mouseX, y: mouseY, text: "", size: whiteboardSize, page: 0});
				whiteboards.push(new Whiteboard("", mouseX, mouseY, whiteboardSize));
				$("#renderwhiteboards").removeClass("hide");
			}
		} else if (dragging !== null && mouseButton === "right") {
			let sqrDistDragged = (mouseX - pressX) ** 2 + (mouseY - pressY) ** 2;
			if (sqrDistDragged <= 3**2 && !isBlocked) {
				if (dragging.text === "" || confirm("Are you sure you want to delete this whiteboard?")) {	
					whiteboards.splice(dragIndex, 1);
					socket.emit("removeWhiteboard", room, dragging.id);
				}
			} else {
				socket.emit("updateWhiteboard", room, {id: dragging.id, x: dragging.x, y: dragging.y, text: dragging.text, size: dragging.size, page: dragging.page});
			}
		}
	}
	if (dragging !== null) {
		dragging.x = lastValidX;
		dragging.y = lastValidY;
		dragging.calcOffset();
	}
	dragging = null;
}