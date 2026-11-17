// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface LabToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface LabOracle {
    function latest() external view returns (uint256 price, uint256 updatedAt);
}

/// @notice Deliberately unsafe, authored local fixture. Never deploy with real assets.
/// @dev Each named case has a separate property and fresh-instance witness in ../test.
contract DefenceLab {
    address public immutable owner;
    address public immutable signer;
    address public operator;
    address public implementation;
    uint256 public marketPrice = 10 ether;
    uint256 public processed;
    uint256 public queueTotal;
    uint256[] private queue;
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public credits;
    mapping(address => uint256) public payments;
    mapping(address => uint256) public voucherCredits;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public tradeCredits;
    mapping(address => uint256) public issuedCredits;

    constructor(address voucherSigner) {
        owner = msg.sender;
        signer = voucherSigner;
        operator = msg.sender;
    }

    receive() external payable {}

    // Supported patterns: one expected finding per named entry point.
    function originRestricted() external view returns (bool) {
        require(tx.origin == owner, "owner");
        return true;
    }

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
    }

    function withdrawLate() external {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "empty");
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "delivery");
        deposits[msg.sender] = 0;
    }

    function ignoreCall(address target) external {
        target.call("");
    }

    function ignoreSend(address payable recipient, uint256 amount) external {
        recipient.send(amount);
    }

    function delegateTo(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory result) = target.delegatecall(data);
        require(ok, "delegate");
        return result;
    }

    function destroyTo(address payable recipient) external {
        selfdestruct(recipient);
    }

    function creditBatch(address[] calldata recipients) external payable {
        require(recipients.length > 0, "recipients");
        for (uint256 i; i < recipients.length; i++) {
            credits[recipients[i]] += msg.value;
        }
    }

    function chooseRecipient(address[] calldata recipients, uint256 choice) external view returns (address) {
        choice; // Intended allocation must not depend on block producers.
        return recipients[block.timestamp % recipients.length];
    }

    function packedKey(string calldata left, string calldata right) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }

    function ignoreToken(LabToken token, address recipient, uint256 amount) external {
        token.transfer(recipient, amount);
    }

    function exactBalance(uint256 expected) external view returns (bool) {
        require(address(this).balance == expected, "reserve");
        return true;
    }

    function pushBatch(address payable[] calldata recipients, uint256 amount) external {
        require(msg.sender == owner, "owner");
        for (uint256 i; i < recipients.length; i++) {
            recipients[i].transfer(amount);
        }
    }

    // Known gaps: the manifest records properties, not fictitious detector IDs.
    function overflowAdd(uint256 left, uint256 right) external pure returns (uint256) {
        unchecked { return left + right; }
    }

    function narrowAmount(uint256 amount) external pure returns (uint64) {
        return uint64(amount);
    }

    function readPrice(LabOracle oracle, uint256 maxAge) external view returns (uint256) {
        maxAge;
        (uint256 price,) = oracle.latest();
        return price;
    }

    function claimVoucher(uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 digest = keccak256(abi.encode(address(this), block.chainid, msg.sender, amount, nonce));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == signer, "signature");
        voucherCredits[msg.sender] += amount;
    }

    function changeOperator(address next) external {
        operator = next;
    }

    function upgradeTo(address next) external {
        implementation = next;
    }

    function executeImplementation(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory result) = implementation.delegatecall(data);
        require(ok, "implementation");
        return result;
    }

    function setMarketPrice(uint256 next) external {
        require(msg.sender == owner, "fixture price operator");
        marketPrice = next;
    }

    function trade(uint256 amount, uint256 minimumOutput) external returns (uint256 output) {
        minimumOutput;
        output = amount * marketPrice / 1 ether;
        tradeCredits[msg.sender] += output;
    }

    function scaledShare(uint256 amount, uint256 total, uint256 shares) external pure returns (uint256) {
        return (amount / total) * shares;
    }

    function issueCredit(uint256 amount) external payable {
        issuedCredits[msg.sender] += amount;
    }

    function enqueueMany(uint256 count) external {
        for (uint256 i; i < count; i++) { queue.push(1); }
    }

    function processQueue(uint256 limit) external {
        limit;
        uint256 sum = queueTotal;
        for (uint256 i = processed; i < queue.length; i++) { sum += queue[i]; }
        queueTotal = sum;
        processed = queue.length;
    }
}
