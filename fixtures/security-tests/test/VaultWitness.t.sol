// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ExecutableVault as VulnerableVault} from "fixture-vulnerable/Vault.sol";
import {ExecutableVault as FixedVault} from "fixture-fixed/Vault.sol";

interface LocalVm {
    function deal(address account, uint256 balance) external;
    function prank(address caller, address origin) external;
    function expectRevert(bytes calldata reason) external;
}
interface LocalVault {
    function deposit() external payable;
    function withdraw() external;
}

// An isolated two-entry callback witness; never contacts a chain or RPC endpoint.
contract ReentryWitness {
    LocalVault immutable vault;
    uint256 stake;
    uint256 callbacks;
    constructor(address target) { vault = LocalVault(target); }
    function exercise() external payable {
        stake = msg.value;
        vault.deposit{value: stake}();
        vault.withdraw();
    }
    receive() external payable {
        if (msg.value > 0 && callbacks == 0 && address(vault).balance >= stake) {
            callbacks++;
            vault.withdraw();
        }
    }
}
contract RejectPayment {
    receive() external payable { revert("recipient rejected payment"); }
}

contract VaultWitnessTest {
    LocalVm constant vm = LocalVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant OWNER = address(0xA11CE);
    address constant INTERMEDIARY = address(0xBAD);
    address payable constant RECIPIENT = payable(address(0xBEEF));

    function testFuzz_VulnerableReentryWithdrawsMoreThanDeposited(uint96 seed) public {
        uint256 amount = 1 gwei + uint256(seed) % 10 ether;
        vm.deal(address(this), amount * 3);
        VulnerableVault vault = new VulnerableVault();
        vault.deposit{value: amount * 2}();
        ReentryWitness witness = new ReentryWitness(address(vault));
        witness.exercise{value: amount}();
        require(address(witness).balance == amount * 2, "vulnerable callback did not reproduce");
        require(address(vault).balance == amount, "unexpected vulnerable accounting");
    }

    function testFuzz_FixedWithdrawalPreservesOtherDeposits(uint96 seed) public {
        uint256 amount = 1 gwei + uint256(seed) % 10 ether;
        vm.deal(address(this), amount * 3);
        FixedVault vault = new FixedVault();
        vault.deposit{value: amount * 2}();
        ReentryWitness witness = new ReentryWitness(address(vault));
        witness.exercise{value: amount}();
        require(address(witness).balance == amount, "fixed withdrawal exceeded its deposit");
        require(address(vault).balance == amount * 2, "other depositor's balance changed");
    }

    function testVulnerableOriginGuardAllowsAnUnauthorizedIntermediary() public {
        vm.prank(OWNER, OWNER);
        VulnerableVault vault = new VulnerableVault();
        vm.deal(address(vault), 1 ether);
        vm.deal(RECIPIENT, 0);
        vm.prank(INTERMEDIARY, OWNER);
        vault.uncheckedSend(RECIPIENT);
        require(RECIPIENT.balance == 1 wei, "origin guard witness did not reproduce");
    }

    function testFixedCallerGuardRejectsAnUnauthorizedIntermediary() public {
        vm.prank(OWNER, OWNER);
        FixedVault vault = new FixedVault();
        vm.deal(address(vault), 1 ether);
        vm.expectRevert(bytes("owner only"));
        vm.prank(INTERMEDIARY, OWNER);
        vault.checkedSend(RECIPIENT);
    }

    function testVulnerablePaymentFailureIsIgnored() public {
        vm.prank(OWNER, OWNER);
        VulnerableVault vault = new VulnerableVault();
        RejectPayment recipient = new RejectPayment();
        vm.deal(address(vault), 1 ether);
        vm.prank(OWNER, OWNER);
        vault.uncheckedSend(payable(address(recipient)));
        require(address(recipient).balance == 0, "rejecting recipient received value");
        require(address(vault).balance == 1 ether, "failed payment changed value");
    }

    function testFixedPaymentFailureReverts() public {
        vm.prank(OWNER, OWNER);
        FixedVault vault = new FixedVault();
        RejectPayment recipient = new RejectPayment();
        vm.deal(address(vault), 1 ether);
        vm.expectRevert(bytes("transfer failed"));
        vm.prank(OWNER, OWNER);
        vault.checkedSend(payable(address(recipient)));
    }
}
