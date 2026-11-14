// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _choose(address to,bool branch) private {if(branch){(bool ok,)=to.call("");require(ok);return;}credit=0;} function run(address to,bool branch) external {_choose(to,branch);} }
