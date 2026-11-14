// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Generated from the 12 primary authored corpus cases.

contract R001F { address owner = msg.sender; function enter() external view { require(msg.sender == owner); } }

contract R002F { mapping(address => uint256) credits;
function withdraw() external { uint256 amount = credits[msg.sender]; credits[msg.sender] = 0; (bool ok,) = payable(msg.sender).call{value:amount}(""); require(ok); } }

contract R003F { function invoke(address target, bytes calldata data) external { (bool ok,) = target.call(data); require(ok); } }

contract R004F { function pay(address payable recipient) external { bool ok = recipient.send(1); require(ok); } }

contract R005F { address owner = msg.sender; function run(address target, bytes calldata data) external { require(msg.sender == owner); (bool ok,) = target.delegatecall(data); require(ok); } }

contract R006F { address owner = msg.sender; function sweep(address payable recipient) external { require(msg.sender == owner); selfdestruct(recipient); } }

contract R007F { mapping(address => uint256) credits; function deposit(address[] calldata recipients) external payable {
uint256 perItem = msg.value / recipients.length; for (uint256 i; i < recipients.length; i++) { credits[recipients[i]] += perItem; } } }

contract R008F { bytes32 verifiedRandomness; address immutable oracle; constructor(address source) { oracle = source; }
function fulfill(bytes32 word) external { require(msg.sender == oracle); verifiedRandomness = word; }
function pick(address[] calldata entrants) external view returns(address) { return entrants[uint256(verifiedRandomness) % entrants.length]; } }

contract R009F { function hash(string calldata a, bytes calldata b) external pure returns(bytes32) { return keccak256(abi.encode(a,b)); } }

interface IToken10F { function transfer(address to, uint256 amount) external returns(bool); }
contract R010F { IToken10F token; constructor(IToken10F configured) { token = configured; } function pay(address to, uint256 amount) external { require(token.transfer(to, amount)); } }

contract R011F { function enough(uint256 expected) external view { require(address(this).balance >= expected); } }

contract R012F { mapping(address => uint256) pending; function withdraw() external {
uint256 amount = pending[msg.sender]; pending[msg.sender] = 0; payable(msg.sender).transfer(amount); } }
