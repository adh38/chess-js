<?php

include 'dbconnect.php';
include 'validate_client.php';
global $mysqli, $player, $playerID, $gameID, $isOwner;

if(!$isOwner) fail('Only the game owner can respond to requests to join');

//determine whose request is being processed and whether they are being accepted or rejected
$requester = $_GET['name'];
$decision = $_GET['decision'];
if($decision === 'accept') $accept = true;
elseif($decision === 'reject') $accept = false;
else fail($decision . ' is not a valid decision - must be "accept" or "reject"');

//first make sure this request is still outstanding - may need to change FOR UPDATE, allegedly only works for InnoDB-like engines
$currentRequest = single('GameRequest', PLAYER_TBL, 'NickName="'.$requester.'" FOR UPDATE');
if($currentRequest !== $gameID) fail('Player '.$requester.' no longer wants to join game '.$gameID);

//update the player table, which will notify the requester of the decision
lock(PLAYER_TBL, 'WRITE');
update(PLAYER_TBL, ($accept ? 'GameID='.$gameID.',' : '') . 'GameRequest=NULL', 'NickName="'.$requester.'"');
unlock();

include_once 'pusher_connect.php';
global $pusher, $roomChannel, $gameChannel;
pusher_trigger($gameChannel, 'processRequest', array('game' => $player, 'owner' => $player, 'player' => $requester, 'accept' => $accept));
if($accept) {
	$requesterID = single('ID', PLAYER_TBL, 'NickName="'.$requester.'"');
	lock(PLAYER_TBL.','.GAME_TBL.','.ROLE_TBL, 'WRITE');
	update(GAME_TBL, 'InProgress=TRUE', 'ID='.$gameID);
	update(ROLE_TBL, 'PlayerID='.$requesterID, 'GameID='.$gameID.' AND Role="TURN"');
	update(PLAYER_TBL, 'Color="White"', 'ID='.$requesterID);
	update(PLAYER_TBL, 'Color="Black"', 'ID='.$playerID);
	unlock();
	pusher_trigger($roomChannel, 'setGame', array('game' => $player, 'inProgress' => true));
	pusher_trigger($gameChannel, 'setTurn', array('player' => $requester));
	//also tell each player what piece set his opponent is using
	foreach(array($player, $requester) as $p) {
		$pieces = multiple_list('User,Board', PLAYER_TBL, 'NickName="'.$p.'"');
		if($pieces != null and $pieces[0][0] != null)
			pusher_trigger($gameChannel, 'changePieces', array('player' => $p, 'user' => $pieces[0][0], 'board' => $pieces[0][1]));
	}
}

succeed(array('success' => true));

?>

