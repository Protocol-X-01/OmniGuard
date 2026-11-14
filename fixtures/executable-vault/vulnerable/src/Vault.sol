// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Complete local-only value-flow witness. Intentionally vulnerable; never deploy.
contract ExecutableVault {
    address public owner;
    mapping(address => uint256) public credits;

    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(tx.origin == owner, "owner only"); _; }

    function deposit() external payable { credits[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = credits[msg.sender];
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        credits[msg.sender] = 0;
    }
    function uncheckedSend(address payable recipient) external onlyOwner {
        recipient.call{value: 1 wei}("");
    }
}
