// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract addressBook { function call(bytes calldata) external pure {} } contract NAddressName { addressBook helper; function run() external { helper.call(""); } }
