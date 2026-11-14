// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { struct Entry {uint amount;} mapping(address=>Entry) entries; function _pay(address to) private {(bool ok,)=to.call("");require(ok);} function _clear(Entry memory copy) private {copy.amount=0;} function run(address to) external {Entry memory copy=entries[msg.sender];_pay(to);_clear(copy);} }
