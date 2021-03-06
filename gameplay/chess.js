var pusher, roomChannel, gameChannel;
var board;

function pusher_init() {
	pusher = new Pusher('44822bc310990bb763a1');
	var channel = roomChannel = pusher.subscribe('roomChannel');
	channel.bind('addPlayer', function(data) {
		addPlayer(data.player);
	});
	channel.bind('removePlayer', function(data) {
		removePlayer(data.player);
	});
	channel.bind('addGame', function(data) {
		addGame(data.game);
	});
	channel.bind('setGame', function(data) {
		if(data.hasOwnProperty('inProgress')) {
			setInProgress(data.game, data.inProgress);
		}
	});
	channel.bind('removeGame', function(data) {
		removeGame(data.game);
	});
	
	channel.bind_all(function(event, data) {
		for(var attr in data) {
			serverLog('  ' + attr + ' => ' + data[attr]);
		}
		serverLog('pusher - ' + event);
		serverLog('');
	});
}

function addPlayer(player) {
	if(state.players.hasOwnProperty(player)) return;
	if(state.nickname === player) return;
	$('#player_list').append('<li>' + player + '</li>');
	state.players[player] = 1;
}
function removePlayer(player) {
	$('#player_list li').filter(function() { return this.textContent === player; }).remove();
	delete state.players[player];
}

function addGame(name) {
	if(state.games.hasOwnProperty(name)) return;
	var $gameEntry = $('<li game="'+name+'" inProgress="false">' + name + '</li>');
	var $joinBtn = $('<button type="button">Request to Join</button>');
	$joinBtn.click(function(event) {
		if(state.request != '') {
			alert('already requesting to join game ' + state.request);
			return;
		}
		var game = this.parentNode.firstChild.textContent;
		setState('game', game);
		do_ajax('place_request', {'nickname': state.nickname, 'game': game}, function(data) {
		}, {});
		setState('request', game);
		$('#game_list button').hide();
	});
	$gameEntry.append($joinBtn);
	$('#game_list').append($gameEntry);
	if(name === state.game) $joinBtn.hide();
	state.games[name] = 0; //value is whether it is in progress
}
function setInProgress(game, inProgress) {
	inProgress = !isFalse(inProgress);
	state.games[game] = inProgress;
	var $li = $('#game_list li[game="'+game+'"]');
	$li.attr('inProgress', inProgress ? 'true' : 'false');
	var $joinBtn = $li.children('button');
	if(inProgress) $joinBtn.hide();
	else $joinBtn.show();
}
function removeGame(game) {
	$('#game_list li[game="'+game+'"]').remove();
	delete state.games[game];
}
function joinButton(game) {
	return $('#game_list li[game="'+game+'"]').children('button');
}

function serverLog(str) {
	var arr = str.split('\n'), div = $('#server_msg')[0];
	for(var i = 0; i < arr.length; i++) {
		div.innerHTML = arr[i] + '<br />' + div.innerHTML;
	}
}

function setState(attr, val) {

	if(val == '') switch(attr) {
		case 'game':
			pusher.unsubscribe('game-' + state.game + '-channel');
			gameChannel = undefined;
			endGame();
			break;
	}
	
	state[attr] = val;

	if(val != '') switch(attr) {
		case 'nickname':
			$('#nickname').html(state.nickname);
			$('#create_game').show();
			break;
		case 'game':
			joinButton(state.game).hide();
			$('#create_game').hide();
			$('#leave_game').show();
			gameChannel = pusher.subscribe('game-' + state.game + '-channel');
			if(state.owner === state.nickname) { //for the game owner, listen for new requests to join
				gameChannel.bind('joinRequest', function(data) {
					serverLog(data.player + ' requesting');
					showDialog(data.player + ' is requesting to join your game.', {
						'Accept': function() { processRequest(data.player, 'accept'); },
						'Reject': function() { processRequest(data.player, 'reject'); }
					});
				});
			}
			else {
				gameChannel.bind('processRequest', function(data) { //for a potential player, listen for a decision on whether I can join the game
					if(data.game === state.request && data.player === state.nickname) {
						setState('request', '');
						if(data.accept) {
							setState('owner', data.owner);
							setState('opponent', data.owner);
							beginGame();
						}else {
							setState('game', '');
							$('#game_list li[inProgress="false"] button').show();
						}
					}
				});
			}
			//when one player's turn has been finished
			gameChannel.bind('setTurn', function(data) {
				setState('turn', data.player);
				setState('moved', false);
			});
			//when any piece has been moved (fires twice separately for castling)
			gameChannel.bind('movePiece', function(data) {
				/*var $piece = board.find('.piece_img[color="'+data.color+'"][pieceID="'+data.piece+'"]');
				var oldRow = parseInt(data.oldRow), oldCol = parseInt(data.oldCol);
				var row = parseInt(data.row), col = parseInt(data.col), $curSpace = $piece.parents('.square');
				//var $space = $('.square[row="'+row+'"][col="'+col+'"]');
				board.movePiece($piece, row, col, true);
				var moveMsg = data.color + ' ' + data.piece + ' from ' + spaceName(oldRow, oldCol) + ' to ' + spaceName(row, col);//*/

				console.log('got move:');
				console.info(data.move);
				board.doCodedMove(data.move, false);
				board.resetMove();
				var color, move, moveMsg = '';
				for(var i = 0; i < data.move.length; i++) {
					moveMsg += data.move[i];
					move = data.move[i].split(' ');
					color = move[0];
				}
				var other = otherColor(data.color), check = board.checkCheck(other);
				if(check) {
					var mate = board.checkCheckmate(other);
					if(mate) {
						console.log(other + ' in checkmate');
						moveMsg += '. CHECKMATE! ' + data.color.toUpperCase() + ' WINS!';
					} else {
						console.log(other + ' now in check!');
						moveMsg += '. CHECK! ' + check[0].color + ' ' + check[0].pieceID;
					}
				}
				$('#game_alert').html(moveMsg);
			});
			//for pawn promotion
			gameChannel.bind('changePiece', function(data) {
				board.changePiece(data.color, data.piece, data.newRank);
			});
			//when either player selects a new set of pieces to play with
			gameChannel.bind('changePieces', function(data) {
				var pieces;
				if(data.player === state.nickname) { //I changed boards - so I already have the pieces cached
					pieces = state.pieces;
				}else if(data.player === state.opponent) { //my opponent changed boards - so make sure I have his new pieces cached
					pieces = state.opponentPieces;
					board.loadBoard(data.user, data.board, false);
					//and reset his color to the new pieces if I am displaying them
					if($('#show_opponent')[0].checked)
						board.switchPieces(otherColor(state.color), data.user, data.board, $('#switch_opponent')[0].checked);
				}
				if(typeof pieces !== 'undefined') { //set the appropriate state attribute
					pieces.user = data.user;
					pieces.board = data.board;
				}
			});
			//for debugging, log all events to the console/server panel
			gameChannel.bind_all(function(event, data) {
				for(var attr in data) {
					serverLog('  ' + attr + ' => ' + data[attr]);
				}
				serverLog('game-'+state.game+' - ' + event);
				serverLog('');
			});
			break;
		case 'turn':
			$('#player_turn').html(state.turn);
			board.resetMove(false);
			//$('#game_alert').html($('#game_alert').html() + ' ' + turnMessage());
			break;
	}
}

function showState() {
	for(var attr in state) {
		serverLog(attr + ' => ' + state[attr]);
	}
	serverLog('State:');
}

function showDialog(message, buttons) {
	$('#dialog_text').html(message);
	$('#dialog_buttons').empty();
	$.each(buttons, function(name, fcn) {
		var click = function() {
			fcn();
			$('#dialog_overlay').css('visibility', 'hidden');
		};
		var props = {click: click, text: name, type: 'button'};
		$('<button></button>', props).appendTo('#dialog_buttons');
	});
	$('#dialog_buttons button').each(function(i) { console.info($(this).click); });
	$('#dialog_overlay').css('visibility', 'visible');
}

function getInitialState() {
	serverLog('getting state');
	console.info('getting initial state');
	do_ajax('get_state', {'nickname': state.nickname}, function(data) {
		console.info(data);
		if(!isNull(data.players)) for(var i = 0; i < data.players.length; i++) addPlayer(data.players[i]);
		if(!isNull(data.games)) for(var i = 0; i < data.games.length; i++) {
			var game = data.games[i];
			addGame(game[0]);
			setInProgress(game[0], game[1]);
		}
	}, {});
}

function loginFunc() {
	setLoggedIn(true);
	console.log('joining as ' + state.nickname);
	setState('nickname', state.nickname);
	console.log('loading initial board');
	board.loadBoard('bickshame', 'strongbox', true);
	//get the initial state of the game room
	getInitialState();
}
function logoutFunc() {
	setLoggedIn(false);
	endGame();
}

function setLoggedIn(isLoggedIn) {
	if(isLoggedIn) {
		$('#logout_msg').hide();
		$('#login_msg').show();
		$('#select_board').show();
		$('#resize_board').show();
		$('#resize_label').show();
	}else {
		$('#login_msg').hide();
		$('#logout_msg').show();
		$('#create_game').hide();
		$('#leave_game').hide();
		$('#piece_display_options').hide();
		$('#select_board').hide();
		$('#resize_board').hide();
		$('#resize_label').hide();
		resetState();
	}
}

function resetState() {
	setState('nickname', '');
	setState('game', '');
	setState('opponent', '');
	setState('owner', '');
	setState('turn', '');
	setState('winner', '');
	setState('request', '');
}

function createGame() {
	if(state.game != '') {
		alert('Already part of a game');
		return;
	}
	do_ajax('new_game', {'nickname': state.nickname}, function(data) {
		$('#create_game').hide();
		$('#leave_game').show();
		setState('owner', state.nickname);
		setState('game', data.game);
	}, {});
}

function leaveGame() {
	if(state.game == '') {
		alert('Not in a game');
		return;
	}
	do_ajax('leave_game', {'nickname': state.nickname}, function(data) {
		$('#leave_game').hide();
		$('#create_game').show();
		setState('game', '');
		endGame();
	}, {});
}

function processRequest(player, decision) {
	do_ajax('process_request', {'nickname': state.nickname, 'name': player, 'decision': decision}, function(data) {
		if(data.success && decision == 'accept') {
			setState('opponent', player);
			beginGame();
		}
	}, {});
}

function beginGame() {
	state.color = state.nickname === state.owner ? 'Black' : 'White';
	$('#player_me').html(state.nickname);
	$('#player_opponent').html(state.opponent);
	$('#game_info').css('visibility', 'visible');
	$('#game_alert').html('Let the game begin!');
	$('#board_panel').append(board.$board);
	$('#piece_display_options').show();
	//$('#board_panel').append(board.$clone);
}
function turnMessage() {
	return 'It is now ' + (state.turn === state.nickname ? 'YOUR' : state.turn+"'s") + ' turn.';
}
function endGame() {
	$('#game_info').css('visibility', 'hidden');
	$('#piece_display_options').hide();
	board.$board.detach();
}

//change which pieces are black and which are white
//-if not mine, do it for my opponents pieces
function switchColors(mine) {
	if(mine) {
		board.switchPieces(state.color, state.pieces.user, state.pieces.board, $('#switch_pieces')[0].checked);
		if(!$('#show_opponent')[0].checked)
			board.switchPieces(otherColor(state.color), state.pieces.user, state.pieces.board, $('#switch_pieces')[0].checked);
	} else if($('#show_opponent')[0].checked) {
		board.switchPieces(otherColor(state.color), state.opponentPieces.user, state.opponentPieces.board, $('#switch_opponent')[0].checked);
	}
}

function debug() {
	console.log(eval($('#debug_text').val()));
}

$(document).ready(function() {
	
	pusher_init();
	board = new Board(8, 8, 100);
	board.getBoardData();
	board.numPlayers = numPlayers; //set to 1 player to just fool around with the board/moves - this is set via php GET - see index.php
	board.setPlayMode();
	Board.gameBoard = board;
	addResizeSlider($('#controls'));
	$('#show_opponent').click(function(e) {
		var other = otherColor(state.color), pieces = this.checked ? state.opponentPieces : state.pieces;
		board.switchPieces(other, pieces.user, pieces.board,
			this.checked ? $('#switch_opponent')[0].checked : $('#switch_pieces')[0].checked);
		board.showingOwnPieces[other] = !this.checked;
		$('#switch_opponent')[0].disabled = !this.checked;
	});
	$('#switch_pieces').click(function(e) {
		switchColors(true);
	});
	$('#switch_opponent').click(function(e) {
		switchColors(false);
	});
	$('#dialog_overlay').css('visibility', 'hidden');
	$('#game_info').css('visibility', 'hidden');
	setLoggedIn(false);
	if(board.numPlayers === 1) {
		board.loadBoard('bickshame', 'strongbox', true);
		$('#board_panel').append(board.$board);
		//$('#board_panel').append(board.$clone);
		$('#select_board').show();
		$('#resize_board').show();
		$('#resize_label').show();
		$('#game_info').css('visibility', 'visible');
		$('#game_alert').html('Hello world.');
		$('#switch_pieces').show();
		$('#controls').append('<button type="button" id="undo_move" onclick="board.undoMove(false)">Undo Move</button>');
	}
	console.log('CHESS DONE');
});

