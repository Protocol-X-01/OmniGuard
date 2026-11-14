// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { struct Entry {uint amount;} mapping(address=>Entry) entries; function _pay(address to) private {(bool ok,)=to.call("");require(ok);} function _clear(Entry storage actual) private {actual.amount=0;} function run(address to) external {_pay(to);_clear(entries[msg.sender]);} }
