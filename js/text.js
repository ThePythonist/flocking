const textColors = {"black": [0, 0, 0],
					"red": [255, 0, 0],
					"blue": [0, 0, 255],
					"green": [0, 128, 0],
					"yellow": [255, 255, 0],
					"purple": [128, 0, 128],
					"pink": [255,192,203]};

class Word {
	constructor(value, bold=false, italic=false, color=(0,0,0)) {
		this.value = value;
		this.bold = bold;
		this.italic = italic;
		this.color = color;
		this.newpage = false;
		this.x = -Infinity;
		this.y = -Infinity;
		this.textIndex = -Infinity;
		this.actualLength = 0;
		this.page = -1;
	}

	draw(x, y, canvas) {
		if (!this.newpage) {
			canvas.fill(this.color);
			canvas.noStroke();
			if (this.bold) {
				if (this.italic) {
					canvas.textStyle(BOLDITALIC);
				} else {
					canvas.textStyle(BOLD);
				}
			} else if (this.italic) {
				canvas.textStyle(ITALIC);
			} else {
				canvas.textStyle(NORMAL);
			}
			this.x = x;
			this.y = y;
			canvas.text(this.value, x, y);
		}
	}

	getClicked(canvas, x, y) {
		let w = canvas.textWidth(this.value);
		let h = canvas.textSize();
		return (this.x <= x && x <= this.x + w && this.y <= y && y <= this.y + h);
	}
}

function lineWidth(line, canvas) {
	let w = 0;
	for (let word of line) {
		w += canvas.textWidth(word.value);
	}
	return w;
}

function drawLine(line, x, y, canvas, page) {
	for (let word of line) {
		word.page = page;
		word.draw(x, y, canvas);
		x += canvas.textWidth(word.value);
	}
}

function wrap(text, maxWidth, canvas, cursorPos) {
	var words = text.split(' ');
	var line = "";
	var lines = [];
	var textIndices = [];
	var activeWordIndex = -1;
	var activeWord = null;
	
	// Split by \n delimiter
	for (let i = words.length -1; i >= 0; i--) {
		let parts = words[i].split("\n");
		if (parts.length > 1) {
			let toAdd = [parts[0]];
			for (let j=1; j<parts.length; j++) {
				toAdd.push("\n");
				toAdd.push(parts[j]);
			}
			let args = [i, 1].concat(toAdd);
			Array.prototype.splice.apply(words, args);
		}
	}

	let currentLength = -1;

	for (let i=0; i<words.length; i++) {
		textIndices.push(currentLength+1);
		if (words[i] !== "\n") {
			currentLength += 1 + words[i].length;
			if (cursorPos !== null && currentLength >= cursorPos && activeWordIndex < 0) {
				activeWordIndex = i;
			}
		}
	}

	if (activeWordIndex < 0 && cursorPos !== null) {
		activeWordIndex = words.length -1;
	}
	
	// Apply rich properties
	let bold = false;
	let italic = false;
	let c = color(0);
	for (let i=0; i<words.length; i++) {
		let actualLength = words[i].length;
		if (words[i] === "{pagebreak}") {
			words[i] = new Word("");
			words[i].newpage = true;
			words[i].actualLength = actualLength;
		} else {
			bold ^= /^[\*_]*\*/g.test(words[i]);
			italic ^= /^[\*_]*_/g.test(words[i]);

			words[i] = words[i].replace(/^[\*_]*[\*_]/g, "");

			let tag = words[i].match(/^{([^{}]*)}/);
			if (tag !== null) {
				if (tag[1] in textColors) {
					let colorVals = textColors[tag[1]];
					c = color(colorVals[0], colorVals[1], colorVals[2]);
					words[i] = words[i].substring(tag[0].length);
				}
			}
			words[i] = new Word(words[i], bold, italic, c);
			words[i].actualLength = actualLength;

			bold ^= /\*[\*_]*$/g.test(words[i].value);
			italic ^= /_[\*_]*$/g.test(words[i].value);

			words[i].value = words[i].value.replace(/[\*_][\*_]*$/g, "");

			tag = words[i].value.match(/{([^{}]*)}$/);
			if (tag !== null) {
				if (tag[1] in textColors) {
					let colorVals = textColors[tag[1]];
					c = color(colorVals[0], colorVals[1], colorVals[2]);
					words[i].value = words[i].value.substring(0, words[i].value.length-tag[0].length);
				}
			}
		}

		if (i === activeWordIndex) {
			activeWord = words[i];
		}
	}

	// Split individual words that are too long
	for (let i = words.length -1; i >= 0; i--) {
		if (words[i] !== null) {
			words[i].textIndex = textIndices[i];
			if (textWidth(words[i].value) > maxWidth) {
				let line = "";
				let newWords = [];
				for (let j=0; j<words[i].value.length; j++) {
					let testLine = line + words[i].value[j];
					if (canvas.textWidth(testLine) >= maxWidth) {
						newWords.push(new Word(line, words[i].bold, words[i].italic, words[i].color));
						line = "";
					}
					line += words[i].value[j];
				}
				if (line !== "" && line !== " ") {
					newWords.push(new Word(line, words[i].bold, words[i].italic, words[i].color));
				}
				let args = [i, 1].concat(newWords);
				Array.prototype.splice.apply(words, args);
			}
		}
	}
	// Wrap lines
	line = [];
	for (let i = 0; i < words.length; i++) {
		if (words[i].newpage) {
			lines.push(line);
			lines.push([words[i]]);
			line = [];
		} else if (words[i].value === "\n") {
			if (!(i !== 0 && words[i-1].newpage) && !(i < words.length-1 && words[i+1].newpage)) {
				lines.push(line);
				line = [];
			}
		} else {
			var testLine = line.concat([words[i]]);
			var testWidth = lineWidth(testLine, canvas);

			if (testWidth > maxWidth) {
				lines.push(line);
				line = [words[i], new Word(" ")];
			} else {
				line = testLine.concat([new Word(" ")]);
			}
		}
	}
	if (line !== []) {
		lines.push(line);
	}

	return {lines: lines, activeWord: activeWord, words: words};
}