// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Local-only remediation control for ExecutableVault, not production audited code.
contract ExecutableVault {
    address public owner;
    mapping(address => uint256) public credits;

    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(msg.sender == owner, "owner only"); _; }

    function deposit() external payable { credits[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = credits[msg.sender];
        credits[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }
    function checkedSend(address payable recipient) external onlyOwner {
        (bool ok,) = recipient.call{value: 1 wei}("");
        require(ok, "transfer failed");
    }
}
