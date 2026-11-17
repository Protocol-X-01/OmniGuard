// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DefenceLab as Vulnerable, LabToken as VToken, LabOracle as VOracle} from "../vulnerable/src/DefenceLab.sol";
import {DefenceLab as Fixed, LabToken as FToken, LabOracle as FOracle} from "../fixed/src/DefenceLab.sol";

interface Vm {
    function deal(address who, uint256 amount) external;
    function prank(address sender) external;
    function prank(address sender, address origin) external;
    function startPrank(address sender, address origin) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function addr(uint256 key) external returns (address);
    function sign(uint256 key, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
}

interface LabVault {
    function deposit() external payable;
    function withdrawLate() external;
}

interface OwnerProbe {
    function originRestricted() external view returns (bool);
}

contract OriginForwarder {
    function invoke(address lab) external view returns (bool) {
        return OwnerProbe(lab).originRestricted();
    }
}

contract Rejector {
    fallback() external payable { revert("fixture rejection"); }
}

contract FalseToken {
    function transfer(address, uint256) external pure returns (bool) { return false; }
}

contract FixtureOracle {
    uint256 public immutable observedAt;
    constructor(uint256 timestamp) { observedAt = timestamp; }
    function latest() external view returns (uint256, uint256) { return (42, observedAt); }
}

contract Marker {
    function marker() external pure returns (uint256) { return 123; }
}

contract OtherMarker {
    function marker() external pure returns (uint256) { return 456; }
}

contract CallbackDepositor {
    LabVault immutable vault;
    bool private entered;
    uint256 public blocked;
    constructor(address target) { vault = LabVault(target); }
    function start() external payable {
        require(msg.value == 1 ether, "fixture stake");
        vault.deposit{value: msg.value}();
        vault.withdrawLate();
    }
    receive() external payable {
        if (!entered) {
            entered = true;
            (bool ok,) = address(vault).call(abi.encodeWithSelector(LabVault.withdrawLate.selector));
            if (!ok) { blocked++; }
        }
    }
}

contract DefenceLabTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    // Public synthetic fixture key; never a credential or funded account.
    uint256 constant SIGNER_KEY = 0xdefe11ce;
    address constant OWNER = address(0xA11CE);
    address constant OUTSIDER = address(0xB0B);
    address payable constant PAYEE = payable(address(0xCAFE));
    Vulnerable private vulnerable;
    Fixed private corrected;
    Rejector private rejector;

    function setUp() public {
        address signer = vm.addr(SIGNER_KEY);
        vm.startPrank(OWNER, OWNER);
        vulnerable = new Vulnerable(signer);
        corrected = new Fixed(signer);
        vm.stopPrank();
        require(OWNER.code.length == 0 && vulnerable.owner() == OWNER && corrected.owner() == OWNER, "EOA owner");
        rejector = new Rejector();
        vm.deal(address(this), 100 ether);
        vm.warp(10_000);
    }

    function test_rule_001_origin_authority() external {
        OriginForwarder intermediary = new OriginForwarder();
        vm.prank(OWNER, OWNER);
        require(intermediary.invoke(address(vulnerable)), "origin case missing");
        vm.prank(OWNER, OWNER);
        (bool ok,) = address(intermediary).staticcall(abi.encodeCall(OriginForwarder.invoke, (address(corrected))));
        require(!ok, "fixed accepted intermediary");
        vm.prank(OWNER, OWNER);
        require(corrected.originRestricted(), "owner rejected");
    }

    function test_rule_002_callback_order() external {
        vulnerable.deposit{value: 2 ether}();
        corrected.deposit{value: 2 ether}();
        CallbackDepositor bad = new CallbackDepositor(address(vulnerable));
        CallbackDepositor good = new CallbackDepositor(address(corrected));
        bad.start{value: 1 ether}();
        good.start{value: 1 ether}();
        require(address(bad).balance == 2 ether && address(vulnerable).balance == 1 ether, "repeat absent");
        require(address(good).balance == 1 ether && address(corrected).balance == 2 ether, "fixed overpayment");
        require(good.blocked() == 1 && bad.blocked() == 0, "callback result");
    }

    function test_rule_003_failed_call() external {
        vulnerable.ignoreCall(address(rejector));
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.ignoreCall, (address(rejector))));
        require(!ok, "failed call accepted");
    }

    function test_rule_004_failed_send() external {
        vm.deal(address(vulnerable), 1 ether);
        vm.deal(address(corrected), 1 ether);
        vulnerable.ignoreSend(payable(address(rejector)), 1 ether);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.ignoreSend, (payable(address(rejector)), 1 ether)));
        require(!ok && address(vulnerable).balance == 1 ether, "send failure oracle");
        corrected.ignoreSend(PAYEE, 1 ether);
        require(PAYEE.balance == 1 ether, "valid send rejected");
    }

    function test_rule_005_delegate_authority() external {
        Marker target = new Marker();
        bytes memory data = abi.encodeWithSelector(Marker.marker.selector);
        vm.prank(OUTSIDER);
        require(abi.decode(vulnerable.delegateTo(address(target), data), (uint256)) == 123, "delegate case");
        vm.prank(OUTSIDER);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.delegateTo, (address(target), data)));
        require(!ok, "outsider delegated");
        vm.prank(OWNER);
        require(abi.decode(corrected.delegateTo(address(target), data), (uint256)) == 123, "owner delegate");
    }

    function test_rule_006_destructive_balance_transfer() external {
        vm.deal(address(vulnerable), 1 ether);
        vm.deal(address(corrected), 1 ether);
        vm.prank(OUTSIDER);
        vulnerable.destroyTo(PAYEE);
        require(PAYEE.balance == 1 ether && address(vulnerable).balance == 0, "balance not moved");
        vm.prank(OUTSIDER);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.destroyTo, (PAYEE)));
        require(!ok && address(corrected).balance == 1 ether, "fixed balance moved");
        // No assumption that SELFDESTRUCT deletes existing code under Cancun.
    }

    function test_rule_007_batch_conservation() external {
        address[] memory recipients = new address[](2);
        recipients[0] = OUTSIDER;
        recipients[1] = PAYEE;
        vulnerable.creditBatch{value: 2 ether}(recipients);
        corrected.creditBatch{value: 2 ether}(recipients);
        require(vulnerable.credits(OUTSIDER) + vulnerable.credits(PAYEE) == 4 ether, "overcredit absent");
        require(corrected.credits(OUTSIDER) + corrected.credits(PAYEE) == 2 ether, "conservation");
    }

    function test_rule_008_block_selection() external {
        address[] memory recipients = new address[](2);
        recipients[0] = OUTSIDER;
        recipients[1] = PAYEE;
        require(vulnerable.chooseRecipient(recipients, 0) == OUTSIDER, "even selection");
        vm.warp(10_001);
        require(vulnerable.chooseRecipient(recipients, 0) == PAYEE, "block dependence absent");
        vm.prank(OWNER);
        require(corrected.chooseRecipient(recipients, 0) == OUTSIDER, "fixed block dependence");
    }

    function test_rule_009_packed_boundary_collision() external view {
        require(vulnerable.packedKey("ab", "c") == vulnerable.packedKey("a", "bc"), "collision absent");
        require(corrected.packedKey("ab", "c") != corrected.packedKey("a", "bc"), "fixed collision");
    }

    function test_rule_010_false_token_result() external {
        FalseToken token = new FalseToken();
        vulnerable.ignoreToken(VToken(address(token)), PAYEE, 1);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.ignoreToken, (FToken(address(token)), PAYEE, 1)));
        require(!ok, "token failure accepted");
    }

    function test_rule_011_unaccounted_ether() external {
        vm.deal(address(vulnerable), 1 ether);
        vm.deal(address(corrected), 1 ether);
        require(vulnerable.exactBalance(1 ether) && corrected.exactBalance(1 ether), "initial reserve");
        vm.deal(address(vulnerable), 1 ether + 1);
        vm.deal(address(corrected), 1 ether + 1);
        (bool ok,) = address(vulnerable).staticcall(abi.encodeCall(Vulnerable.exactBalance, (1 ether)));
        require(!ok && corrected.exactBalance(1 ether), "dust boundary");
    }

    function test_rule_012_recipient_isolation() external {
        vm.deal(address(vulnerable), 2 ether);
        vm.deal(address(corrected), 2 ether);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(address(rejector));
        recipients[1] = PAYEE;
        vm.prank(OWNER);
        (bool ok,) = address(vulnerable).call(abi.encodeCall(Vulnerable.pushBatch, (recipients, 1 ether)));
        require(!ok && PAYEE.balance == 0, "batch not blocked");
        vm.prank(OWNER);
        corrected.pushBatch(recipients, 1 ether);
        vm.prank(PAYEE);
        corrected.claimPayment();
        require(PAYEE.balance == 1 ether && corrected.payments(address(rejector)) == 1 ether, "isolation");
    }

    function test_gap_001_unchecked_overflow() external view {
        require(vulnerable.overflowAdd(type(uint256).max, 1) == 0, "wrap absent");
        (bool ok,) = address(corrected).staticcall(abi.encodeCall(Fixed.overflowAdd, (type(uint256).max, 1)));
        require(!ok && corrected.overflowAdd(2, 3) == 5, "checked arithmetic");
    }

    function test_gap_002_narrowing() external view {
        uint256 amount = uint256(type(uint64).max) + 1;
        require(vulnerable.narrowAmount(amount) == 0, "truncation absent");
        (bool ok,) = address(corrected).staticcall(abi.encodeCall(Fixed.narrowAmount, (amount)));
        require(!ok && corrected.narrowAmount(7) == 7, "width check");
    }

    function test_gap_003_oracle_freshness() external {
        FixtureOracle stale = new FixtureOracle(1);
        require(vulnerable.readPrice(VOracle(address(stale)), 60) == 42, "stale price absent");
        (bool ok,) = address(corrected).staticcall(abi.encodeCall(Fixed.readPrice, (FOracle(address(stale)), 60)));
        require(!ok, "stale price accepted");
        FixtureOracle fresh = new FixtureOracle(block.timestamp);
        require(corrected.readPrice(FOracle(address(fresh)), 60) == 42, "fresh price rejected");
    }

    function test_gap_004_voucher_replay() external {
        bytes32 badDigest = keccak256(abi.encode(address(vulnerable), block.chainid, address(this), uint256(7), uint256(0)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, badDigest);
        vulnerable.claimVoucher(7, 0, v, r, s);
        vulnerable.claimVoucher(7, 0, v, r, s);
        require(vulnerable.voucherCredits(address(this)) == 14, "replay absent");
        bytes32 goodDigest = keccak256(abi.encode(address(corrected), block.chainid, address(this), uint256(7), uint256(0)));
        (v, r, s) = vm.sign(SIGNER_KEY, goodDigest);
        corrected.claimVoucher(7, 0, v, r, s);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.claimVoucher, (7, 0, v, r, s)));
        require(!ok && corrected.voucherCredits(address(this)) == 7, "nonce not consumed");
    }

    function test_gap_005_role_update() external {
        vm.prank(OUTSIDER);
        vulnerable.changeOperator(OUTSIDER);
        require(vulnerable.operator() == OUTSIDER, "role case absent");
        vm.prank(OUTSIDER);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.changeOperator, (OUTSIDER)));
        require(!ok && corrected.operator() == OWNER, "role overwritten");
    }

    function test_gap_006_upgrade_authority() external {
        Marker original = new Marker();
        OtherMarker replacement = new OtherMarker();
        vm.prank(OWNER);
        vulnerable.upgradeTo(address(original));
        vm.prank(OWNER);
        corrected.upgradeTo(address(original));
        vm.prank(OUTSIDER);
        vulnerable.upgradeTo(address(replacement));
        vm.prank(OUTSIDER);
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.upgradeTo, (address(replacement))));
        require(!ok, "upgrade authorized outsider");
        bytes memory data = abi.encodeWithSelector(Marker.marker.selector);
        require(abi.decode(vulnerable.executeImplementation(data), (uint256)) == 456, "upgrade effect absent");
        require(abi.decode(corrected.executeImplementation(data), (uint256)) == 123, "fixed implementation changed");
    }

    function test_gap_007_slippage() external {
        vm.prank(OWNER);
        vulnerable.setMarketPrice(1 ether);
        vm.prank(OWNER);
        corrected.setMarketPrice(1 ether);
        require(vulnerable.trade(1 ether, 10 ether) == 1 ether, "minimum unexpectedly enforced");
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.trade, (1 ether, 10 ether)));
        require(!ok && corrected.tradeCredits(address(this)) == 0, "slippage accepted");
        require(corrected.trade(1 ether, 1 ether) == 1 ether, "valid trade rejected");
    }

    function test_gap_008_rounding_order() external view {
        require(vulnerable.scaledShare(9, 10, 100) == 0, "early truncation absent");
        require(corrected.scaledShare(9, 10, 100) == 90, "scaled share");
    }

    function test_gap_009_credit_backing() external {
        vulnerable.issueCredit(1 ether);
        require(vulnerable.issuedCredits(address(this)) > address(vulnerable).balance, "unbacked credit absent");
        (bool ok,) = address(corrected).call(abi.encodeCall(Fixed.issueCredit, (1 ether)));
        require(!ok, "unbacked credit accepted");
        corrected.issueCredit{value: 1 ether}(1 ether);
        require(corrected.issuedCredits(address(this)) == address(corrected).balance, "backing");
    }

    function test_gap_010_bounded_queue_progress() external {
        vulnerable.enqueueMany(1024);
        corrected.enqueueMany(1024);
        (bool badOk,) = address(vulnerable).call{gas: 150_000}(abi.encodeCall(Vulnerable.processQueue, (8)));
        (bool goodOk,) = address(corrected).call{gas: 150_000}(abi.encodeCall(Fixed.processQueue, (8)));
        require(!badOk && vulnerable.processed() == 0, "unbounded batch made progress");
        require(goodOk && corrected.processed() == 8 && corrected.queueTotal() == 8, "bounded progress");
    }

    function testFuzz_narrowing_preserves_representable_values(uint64 amount) external view {
        require(corrected.narrowAmount(amount) == amount, "narrowing valid domain");
    }

    function testFuzz_full_ownership_preserves_amount(uint64 amount, uint64 totalSeed) external view {
        uint256 total = uint256(totalSeed) + 1;
        require(corrected.scaledShare(amount, total, total) == amount, "full ownership lost value");
    }
}
