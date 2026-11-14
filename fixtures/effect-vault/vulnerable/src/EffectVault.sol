// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract EffectVault {
    struct Credit { uint256 amount; }
    mapping(address => Credit) private credits;

    function deposit() external payable {
        credits[msg.sender].amount += msg.value;
    }

    function balanceOf(address who) external view returns (uint256) {
        return credits[who].amount;
    }

    function withdraw() external {
        Credit storage credit = credits[msg.sender];
        uint256 amount = credit.amount;
        require(amount != 0, "no credit");
        _send(payable(msg.sender), amount);
        credit.amount = 0;
    }

    function _send(address payable recipient, uint256 amount) private {
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "send failed");
    }
}
