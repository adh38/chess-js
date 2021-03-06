//converts jQuery (graphical) chessboard representation into minimal object and does game analysis on it

//from a jQuery board (see Board.js) make an object of the form: board[color][pieceID] = [row, col]
function BoardObj(board) {
	var _self = this;
	_self.numRows = board.rows;
	_self.numCols = board.cols;
	_self.squares = {};
	_self.pieces = {};
	_self.inCheck = {}; //whether each team is currently in check
	_self.validSquares = {};
	_self.validSquares['valid'] = {};
	_self.validSquares['validCheck'] = {};
	for(var r = 0; r < board.rows; r++) {
		_self.squares[r] = {};
		for(var c = 0; c < board.cols; c++)
			_self.squares[r][c] = {valid: false, validCheck: false};
		_self.validSquares['valid'][r] = {};
		_self.validSquares['validCheck'][r] = {};
	}
	//store all moves that happen on a given turn, including rook moving when castling, pawn being promoted, piece being taken
	_self.currentMove = [];
	_self.history = [];
	for(var c = 0; c < colors.length; c++) {
		_self.pieces[colors[c]] = {};
		_self.inCheck[colors[c]] = false;
	}
	board.$board.find('.piece_img').each(function(ind) {
		var $this = $(this), $square = $this.parents('.square');
		var color = $this.attr('color'), pieceID = $this.attr('pieceID'), rank = $this.attr('rank');
		var row = parseInt($square.attr('row')), col = parseInt($square.attr('col'));
		_self.pieces[color][pieceID] = {row: row, col: col, rank: rank, moved: false};
		$.extend(_self.squares[row][col], {color: color, pieceID: pieceID, rank: rank});
	});
}

BoardObj.prototype.movePiece = function(color, pieceID, newRow, newCol, check, save) {
	//identify the current piece and square
	var piece = this.pieces[color][pieceID];
	if(piece.row === newRow && piece.col === newCol) return; //nothing to do
	var square = piece.row == null ? null : this.squares[piece.row][piece.col];
	
	//if there is already a piece on this square, remove it from the board
	if(newRow != null) {
		var newSquare = this.squares[newRow][newCol];
		if(typeof newSquare.color !== 'undefined') {
			this.movePiece(newSquare.color, newSquare.pieceID, null, null, check, save);
		}
	}
	
	//if we are just doing this to test for check (ie. not through Board.doMove), we need to handle castling on our own
	if(!check && save && pieceID === 'K' && Math.abs(newCol - piece.col) === 2) {
		var dir = newCol - piece.col > 0 ? 1 : -1, rookID = dir > 0 ? 'QR' : 'KR';
		console.log('testing castling: ' + rookID + ' to ' + piece.row + ',' + (piece.col+dir) + ', ' + check + ',' + save);
		this.movePiece(color, rookID, piece.row, piece.col+dir, check, save);
	}
	
	if(save) { //add this move to the history
		var moveStr = color + ' ' + pieceID + ' ' + piece.row+','+piece.col + ' ' + newRow+','+newCol;
		this.currentMove.push(moveStr);
	}
	
	//transfer all piece-related attributes from the old square to the new
	for(var attr in square) if(!attr.match(/^valid/)) {
		if(square != null) {
			if(newRow != null) this.squares[newRow][newCol][attr] = square[attr];
			delete square[attr];
		}
	}
	if(square == null) this.setSquare(color, pieceID, newRow, newCol);
	//set the piece to the new position
	piece.row = newRow;
	piece.col = newCol;
	if(check) piece.moved = true;
}

BoardObj.prototype.setSquare = function(color, pieceID, row, col) {
	var square = this.squares[row][col];
	square.pieceID = pieceID;
	square.color = color;
	square.rank = pieceToRank(pieceID);
}

//remove the last move from the cache, ie. upon starting a new turn, since it will no longer be undone
BoardObj.prototype.resetMove = function() {
	if(this.currentMove.length > 0) this.history.push(this.currentMove);
	this.currentMove = [];
}

BoardObj.prototype.undoMove = function() {
	var lastMove = this.history.pop();
	for(var i = lastMove.length-1; i >= 0; i--) {
		var move = lastMove[i].split(' ');
		var color = move[0], pieceID = move[1], prevSquare = move[2].split(',');
		this.movePiece(color, pieceID, parseInt(prevSquare[0]), parseInt(prevSquare[1]), false, false);
	}
}

BoardObj.prototype.takePiece = function(color, pieceID) {
	this.movePiece(color, pieceID, null, null, true, true);
}

BoardObj.prototype.changePiece = function(color, pieceID, newRank) {
	var piece = this.pieces[color][pieceID];
	piece.rank = newRank;
	this.squares[piece.row][piece.col].rank = newRank;
}

//discrete jumps a given piece can make
function moveVectors(color, rank) {
	var vectors;
	switch(rank) {
		case 'Pawn': vectors = color === 'White' ? [[0,1],[1,1],[-1,1]] : [[0,-1],[1,-1],[-1,-1]]; break;
		case 'Rook': vectors = [[0,1],[1,0],[0,-1],[-1,0]]; break;
		case 'Knight': vectors = [[1,2],[2,1],[1,-2],[2,-1],[-1,2],[-2,1],[-1,-2],[-2,-1]]; break;
		case 'Bishop': vectors = [[1,1],[1,-1],[-1,1],[-1,-1]]; break;
		case 'Queen': vectors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]; break;
		case 'King': vectors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]; break;
		default: vectors = [];
	}
	return vectors;
}
//whether a piece can move multiple spaces in its legal directions
function moveMultiple(rank) {
	return rank === 'Rook' || rank === 'Bishop' || rank === 'Queen';
}

//get the rank from a piece's ID
function pieceToRank(pieceID) {
	if(pieceID.match(/^P\d$/)) return 'Pawn';
	if(pieceID.match(/^[K,Q]R$/)) return 'Rook';
	if(pieceID.match(/^[K,Q]K$/)) return 'Knight';
	if(pieceID.match(/^[K,Q]B$/)) return 'Bishop';
	if(pieceID === 'K') return 'King';
	if(pieceID === 'Q') return 'Queen';
	return undefined;
}

//mark the spaces a given piece can move to
//-if check = true, make sure each valid square does not put the moving team's king in check
//return the number of valid spaces
BoardObj.prototype.getValidSquares = function(color, pieceID, check) {

	if(check) this.clearValid(true);
	
	var piece = this.pieces[color][pieceID], numValid = 0;

	var vectors = moveVectors(color, piece.rank), multiple = moveMultiple(piece.rank);
	for(var i = 0; i < vectors.length; i++) {
		var vec = vectors[i];
		//console.log('checking vector ' + vec[0] + ',' + vec[1]);
		var row = piece.row, col = piece.col, nextSquare, occupant;
		while(true) {
			row += vec[1];
			col += vec[0];
			if(check) {
				//console.log('testing ' + row+','+col);
			}
			if(row < 0 || row >= this.numRows || col < 0 || col >= this.numCols) break;
			nextSquare = this.squares[row][col];
			if(typeof nextSquare.color !== 'undefined') { //this square has a piece on it
				if(nextSquare.color === color) break; //has one of my pieces
				if(piece.rank === 'Pawn' && vec[0] === 0) break; //pawn can only take when moving diagonally
			}
			else if(piece.rank === 'Pawn' && vec[0] !== 0) break; //pawn can only move diagonally when taking

			if(!check || !this.checkMoveCheck(color, pieceID, row, col)) {
				this.setValid(color, pieceID, row, col, true, check);
				numValid++;
			}
			if(typeof nextSquare.color !== 'undefined') break; //has an opponent's piece - so it is valid, but can't move past it

			//allow pawn to move 2 spaces on first move
			if(piece.rank === 'Pawn' && vec[0] === 0 &&
				((color === 'White' && row === 2) || (color === 'Black' && row === 5))) continue; 
	
			if(!multiple) break;
		}
	}
	
	if(!check) return numValid; //don't consider castling when only using this function to test if king is in check
	//allow king to castle if neither he nor castling rook has moved, and he won't pass from/through/into check
	if(piece.rank === 'King' && !piece.moved && !this.inCheck[color]) {
		var rooks = ['KR', 'QR'];
		for(var i = 0; i < rooks.length; i++) {
			var rook = this.pieces[color][rooks[i]], castle = true;
			if(rook.moved) continue;
			var kingCol = piece.col, rookCol = rook.col;
			var dir = (kingCol - rookCol) > 0 ? -1 : 1;
			//can't move through check, so space next to king must be a valid move as well
			if(!this.validSquares['valid'][piece.row][piece.col+dir]) continue;
			for(var c = kingCol+dir; c !== rookCol; c += dir)
				if(typeof this.squares[piece.row][c].color !== 'undefined') castle = false;
			console.log('castling? ' + piece.row + ',' + (kingCol+2*dir));
			if(castle && !this.checkMoveCheck(color, pieceID, piece.row, kingCol+2*dir)) {
				this.setValid(color, pieceID, piece.row, kingCol+2*dir, true, check);
				numValid++;
			}
		}
	}
	return numValid;
}

//-if check = true, set the 'valid' attr - otherwise, we are just checking whether a move puts the king in check, so set the 'validCheck' attr
BoardObj.prototype.setValid = function(color, pieceID, row, col, valid, check) {
	var attr = check ? 'valid' : 'validCheck';
	this.squares[row][col][attr] = valid;
	if(valid) {
		if(typeof this.validSquares[attr][row][col] === 'undefined') this.validSquares[attr][row][col] = [];
		this.validSquares[attr][row][col].push({color: color, pieceID: pieceID});
	}
	else delete this.validSquares[attr][row][col];
}

BoardObj.prototype.clearValid = function(check) {
	var attr = check ? 'valid' : 'validCheck';
	for(var row in this.validSquares[attr])
		for(var col in this.validSquares[attr][row]) {
			this.squares[row][col][attr] = false;
			delete this.validSquares[attr][row][col];
		}
}

//return whether the king of the given color is in check
BoardObj.prototype.checkCheck = function(color) {
	var other = otherColor(color);
	for(var pieceID in this.pieces[other]) {
		if(this.pieces[other][pieceID].row == null) continue;
		this.getValidSquares(other, pieceID, false);
	}
	var king = this.pieces[color]['K'];
	var rowCheck = this.validSquares['validCheck'][king.row];
	var ret = typeof rowCheck !== 'undefined' ? rowCheck[king.col] : undefined;
	this.clearValid(false);
	return ret;
}

//see if making the specified move will put the moving team's king in check
var logcmc = false;
BoardObj.prototype.checkMoveCheck = function(color, pieceID, newRow, newCol) {
	//if(pieceID==='K')
	if(logcmc) console.log('checking ' + color + ' ' + pieceID + ' to ' + newRow + ',' + newCol);
	this.movePiece(color, pieceID, newRow, newCol, false, true);
	this.resetMove();
	var ret = this.checkCheck(color);
	if(logcmc) console.log('undoing ' + this.history[this.history.length-1]);
	this.undoMove();
	return ret;
};

//see if the specified team is in checkmate
BoardObj.prototype.checkCheckmate = function(color) {
	//loop over all moves that the defending team could make, and check check for each
	var mate = true;
	logcmc = true;
	//console.log('checking ' + color + ' mate');
	for(var pieceID in this.pieces[color]) {
		var piece = this.pieces[color][pieceID];
		if(piece.row == null) continue;
		//console.log("\t" + color + ' ' + pieceID);
		if(this.getValidSquares(color, pieceID, true) > 0) {
			//console.log("\thas valid");
			mate = false;
			break;
		}
	}
	this.clearValid(true);
	return mate;
}

