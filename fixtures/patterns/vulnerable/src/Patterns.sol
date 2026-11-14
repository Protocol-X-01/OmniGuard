// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Generated from the 12 primary authored corpus cases.

contract R001V { address owner = msg.sender; function enter() external view { require(tx.origin == owner); } }

contract R002V { mapping(address => uint256) credits;
function withdraw() external { uint256 amount = credits[msg.sender]; (bool ok,) = payable(msg.sender).call{value:amount}(""); require(ok); credits[msg.sender] = 0; } }

contract R003V { function invoke(address target, bytes calldata data) external { target.call(data); } }

contract R004V { function pay(address payable recipient) external { recipient.send(1); } }

contract R005V { function run(address target, bytes calldata data) external { (bool ok,) = target.delegatecall(data); require(ok); } }

contract R006V { function sweep(address payable recipient) external { selfdestruct(recipient); } }

contract R007V { mapping(address => uint256) credits; function deposit(address[] calldata recipients) external payable {
for (uint256 i; i < recipients.length; i++) { credits[recipients[i]] += msg.value; } } }

contract R008V { function pick(address[] calldata entrants) external view returns(address) {
return entrants[uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao))) % entrants.length]; } }

contract R009V { function hash(string calldata a, bytes calldata b) external pure returns(bytes32) { return keccak256(abi.encodePacked(a,b)); } }

interface IToken10V { function transfer(address to, uint256 amount) external returns(bool); }
contract R010V { IToken10V token; constructor(IToken10V configured) { token = configured; } function pay(address to, uint256 amount) external { token.transfer(to, amount); } }

contract R011V { function exact(uint256 expected) external view { require(address(this).balance == expected); } }

contract R012V { function batch(address payable[] calldata recipients) external payable {
for (uint256 i; i < recipients.length; i++) { recipients[i].transfer(1); } } }
