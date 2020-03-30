const iconSize = 200;
const sqrProx = 200**2;
const animationTime = 250;
const flipButtonSize = 30;

class Whiteboard {
	constructor(id, x, y, size) {
		this.id = id;
		this.x = x;
		this.y = y;
		this.size = size;
		this.lastSize = size;
		this.text = "";
		this.lastText = "";
		this.openTime;
		this.closeTime;
		this.open = false;
		this.graphics = [];
		this.page = 0;
		this.words = [];
		this.cursorPos = null;
		this.xOff = null;
		this.yOff = null;
	}

	getOffsets(size) {
		let xOff = 0;
		let yOff = 0;
		if (this.x - size/2 < 0) {
			xOff = size/2 - this.x;
		} else if (this.x + size/2 > width) {
			xOff = width - size/2 - this.x;
		}

		if (this.y - size/2 < 0) {
			yOff = size/2 - this.y;
		} else if (this.y + size/2 > height) {
			yOff = height - size/2 - this.y;
		}
		return {x: xOff, y: yOff};
	}

	calcOffset() {
		let offsets = this.getOffsets(this.size);
		this.xOff = offsets.x;
		this.yOff = offsets.y;
	}

	addCanvas() {
		let graphics = createGraphics(this.size, this.size)
		graphics.background(255);
		graphics.noStroke();
		graphics.fill(0);
		graphics.textSize(20);
		graphics.textAlign(LEFT, TOP);
		this.graphics.push(graphics);
	}

	render() {
		for (let graphics of this.graphics) {
			graphics.canvas.remove();
		}
		this.graphics = [];
		let i = 0;
		this.addCanvas();
		let data = wrap(this.text, this.size-10, this.graphics[0], this.cursorPos);
		this.words = data.words;
		this.cursorPos = null;
		let y = 5;
		for (let line of data.lines) {
			if ((line.length > 0 && line[0].newpage) || y >= this.size - this.graphics[i].textSize()-10-flipButtonSize) {
				y = 5;
				this.addCanvas();
				i++;
			}
			if (data.activeWord !== null) {
				for (let word of line) {
					if (data.activeWord === word) {
						this.page = i;
						socket.emit("updateWhiteboard", room, {id: this.id, x: this.x, y: this.y, text: this.text, size: this.size, page: this.page});
						break;
					}
				}
			}
			if (line.length > 0 && !line[0].newpage) {
				drawLine(line, 5, y, this.graphics[i], i);
				y += this.graphics[i].textSize();
			}
		}
	}

	isNear(x, y) {
		for (let whiteboard of whiteboards) {
			if (whiteboard !== this) {
				if (whiteboard.open) {
					return false;
				}
			}
		}
		this.calcOffset();
		if (participating) {
			return (x - this.x) ** 2 + (y - this.y) ** 2 <= sqrProx;
		} else if (this.open) {
			return (abs(x - this.x - this.xOff) <= this.size/2 && abs(y - this.y - this.yOff) <= this.size/2);
		} else {
			return (abs(x - this.x) <= iconSize/2 && abs(y - this.y) <= iconSize/2);
		}
	}

	drawWireframe() {
		rectMode(CENTER);
		push();
		translate(this.x, this.y);
		fill(0, 0, 255, 10);
		strokeWeight(1);
		stroke(0, 0, 255, 50);
		rect(0, 0, iconSize, iconSize);
		pop();
	}

	getClicked() {
		this.calcOffset();
		if (abs(this.y + this.yOff + (this.size-flipButtonSize)/2 - mouseY) <= flipButtonSize/2) {
			if (abs(this.x + this.xOff + (flipButtonSize-this.size)/2 - mouseX) <= flipButtonSize/2) {
				return -1;
			} else if (abs(this.x + this.xOff + (this.size - flipButtonSize)/2 - mouseX) <= flipButtonSize/2) {
				return 1;
			}
		}
		for (let word of this.words) {
			if (word.page === this.page) {
				let xRel = mouseX - (this.x + this.xOff - this.size/2);
				let yRel = mouseY - (this.y + this.yOff - this.size/2);
				if (word.getClicked(this.graphics[word.page], xRel, yRel)) {
					setCaretToPos($("#whiteboard")[0], word.textIndex);
				}
			}
		}
		return 0;
	}

	draw(playerX, playerY, floating=false) {
		this.calcOffset();
		this.x = constrain(this.x, iconSize/2, width-iconSize/2);
		this.y = constrain(this.y, iconSize/2, height-iconSize/2);

		if (this.graphics.length === 0) {
			this.render();
		}
		if (this.size !== this.lastSize) {
			this.render();
			this.lastSize = this.size;
		}

		if (this.text !== this.lastText) {
			this.render();
			this.lastText = this.text;
		}
		rectMode(CENTER);
		push();
		translate(this.x, this.y);

		if (this.page >= this.graphics.length) {
			this.page = this.graphics.length -1;
			socket.emit("updateWhiteboard", room, {id: this.id, x: this.x, y: this.y, text: this.text, size: this.size, page: this.page});
		}
		if (this.isNear(playerX, playerY)) {
			if (!this.open) {
				this.openTime = millis();
			}
			this.open = true;
			let size = map(constrain(millis() - this.openTime, 0, animationTime), 0, animationTime, iconSize, this.size);
			fill(255, 255, 255, 128);
			stroke(0);
			strokeWeight(1);
			imageMode(CENTER);
			let offsets = this.getOffsets(size);
			image(this.graphics[this.page], offsets.x, offsets.y, size, size);
			noFill();
			rect(offsets.x, offsets.y, size, size);
			fill(255);
			if (size === this.size) {
				push();
				imageMode(CORNER);
				translate(this.xOff-this.size/2, this.yOff-this.size/2);
				image(this.graphics[this.page], 0, 0)
				pop();
				fill(255, 241, 207);
				stroke(0);
				strokeWeight(1);
				rectMode(CORNER);
				// Flip buttons
				textSize(20);
				textAlign(CENTER, CENTER);
				rect(this.xOff-this.size/2, this.yOff+this.size/2-flipButtonSize, flipButtonSize, flipButtonSize);
				rect(this.xOff+this.size/2-flipButtonSize, this.yOff+this.size/2-flipButtonSize, flipButtonSize, flipButtonSize);
				fill(255, 0, 0);
				stroke(0);
				strokeWeight(1);
				text("<", (flipButtonSize-this.size)/2+this.xOff, (this.size-flipButtonSize)/2+this.yOff);
				text(">", (this.size-flipButtonSize)/2+this.xOff, (this.size-flipButtonSize)/2+this.yOff);
				rectMode(CENTER);
				textAlign(CENTER, BOTTOM);
				fill(0);
				noStroke();
				text(`Page ${this.page+1} of ${this.graphics.length}`, this.xOff, this.yOff+this.size/2-3);
			}
			stroke(0);
			noFill();
			strokeWeight(1);
			rect(offsets.x, offsets.y, size, size);
			fill(255);
		} else {
			if (floating) {
				stroke(0, 0, 255, 50);
				noFill();
				rect(this.xOff, this.yOff, this.size, this.size);
			}
			if (this.open) {
				this.closeTime = millis();
			}
			this.open = false;
			let size = map(constrain(millis() - this.closeTime, 0, animationTime), 0, animationTime, this.size, iconSize);
			if (size > iconSize) {
				let offsets = this.getOffsets(size);
				stroke(0);
				fill(255, 255, 255, 128);
				imageMode(CENTER);
				image(this.graphics[this.page], offsets.x, offsets.y, size, size);
				noFill();
				strokeWeight(1);
				rect(offsets.x, offsets.y, size, size);
			} else {
				stroke(0);
				fill(255);
				imageMode(CENTER);
				tint(255, 255, 255, 200);
				image(this.graphics[this.page], 0, 0, iconSize, iconSize);
				tint(255);
				strokeWeight(2);
				noFill();
				rect(0, 0, iconSize, iconSize);
				if (this.id >= 0) {
					textAlign(CENTER, BOTTOM);
					textSize(20);
					noStroke();
					fill(0);
					text(this.id+1, 0, -iconSize/2-5);
				}
			}
		}
		pop();
	}
}