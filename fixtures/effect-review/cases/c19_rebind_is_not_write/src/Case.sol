// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { struct Entry{uint amount;} mapping(address=>Entry) entries; function run(address to,address who) external {Entry storage ref=entries[who];(bool ok,)=to.call("");require(ok);ref=entries[msg.sender];} }
