// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PUnusedShadow { event Seen(bool); function run(address target) external { (bool ok,) = target.call(""); { bool ok = true; emit Seen(ok); } } }
