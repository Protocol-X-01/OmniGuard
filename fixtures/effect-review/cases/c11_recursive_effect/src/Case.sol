// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _recurse(address to,uint depth) private {if(depth!=0){_recurse(to,depth-1);}else{(bool ok,)=to.call("");require(ok);}} function run(address to,uint depth) external {_recurse(to,depth);credit=0;} }
