<?php

include_once 'dbconnect.php';
include_once 'validate_client.php';
include_once 'pusher_connect.php';

global $mysqli, $response, $player, $playerID, $gameID, $pusher, $roomChannel, $gameChannel;

addResponse($player.' ['.$playerID.'] logging out');

//remove the client from any game they may be part of
if($gameID !== NULL) {
	$indirect = true; //let leave_game know not to close the connection
	include 'leave_game.php';
}else {
	addResponse('not in a game anyway');
}

//remove the player from the player table
lock(PLAYER_TBL, 'WRITE');
addResponse('deleting playerID '.$playerID);
delete(PLAYER_TBL, 'ID='.$playerID);
unlock();
$pusher->trigger($roomChannel, 'removePlayer', array('player' => $player));

succeed(array('success' => true));

?>
