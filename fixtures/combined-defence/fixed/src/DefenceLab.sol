// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface LabToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface LabOracle {
    function latest() external view returns (uint256 price, uint256 updatedAt);
}

/// @notice Corrections for the specific local fixture properties, not a production protocol.
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

    function originRestricted() external view returns (bool) {
        require(msg.sender == owner, "owner");
        return true;
    }

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
    }

    function withdrawLate() external {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "empty");
        deposits[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "delivery");
    }

    function ignoreCall(address target) external {
        (bool ok,) = target.call("");
        require(ok, "call failed");
    }

    function ignoreSend(address payable recipient, uint256 amount) external {
        bool ok = recipient.send(amount);
        require(ok, "send failed");
    }

    function delegateTo(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "owner");
        (bool ok, bytes memory result) = target.delegatecall(data);
        require(ok, "delegate");
        return result;
    }

    function destroyTo(address payable recipient) external {
        require(msg.sender == owner, "owner");
        selfdestruct(recipient);
    }

    function creditBatch(address[] calldata recipients) external payable {
        require(recipients.length > 0 && msg.value % recipients.length == 0, "allocation");
        uint256 each = msg.value / recipients.length;
        for (uint256 i; i < recipients.length; i++) { credits[recipients[i]] += each; }
    }

    // Deterministic, owner-authorized allocation; this does not claim secure randomness.
    function chooseRecipient(address[] calldata recipients, uint256 choice) external view returns (address) {
        require(msg.sender == owner, "owner");
        return recipients[choice];
    }

    function packedKey(string calldata left, string calldata right) external pure returns (bytes32) {
        return keccak256(abi.encode(left, right));
    }

    function ignoreToken(LabToken token, address recipient, uint256 amount) external {
        require(token.transfer(recipient, amount), "token failed");
    }

    function exactBalance(uint256 expected) external view returns (bool) {
        require(address(this).balance >= expected, "reserve");
        return true;
    }

    function pushBatch(address payable[] calldata recipients, uint256 amount) external {
        require(msg.sender == owner, "owner");
        for (uint256 i; i < recipients.length; i++) { payments[recipients[i]] += amount; }
    }

    function claimPayment() external {
        uint256 amount = payments[msg.sender];
        payments[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "payment");
    }

    function overflowAdd(uint256 left, uint256 right) external pure returns (uint256) {
        return left + right;
    }

    function narrowAmount(uint256 amount) external pure returns (uint64) {
        require(amount <= type(uint64).max, "width");
        return uint64(amount);
    }

    function readPrice(LabOracle oracle, uint256 maxAge) external view returns (uint256) {
        (uint256 price, uint256 updatedAt) = oracle.latest();
        require(price > 0 && updatedAt <= block.timestamp, "observation");
        require(block.timestamp - updatedAt <= maxAge, "stale");
        return price;
    }

    function claimVoucher(uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(nonce == nonces[msg.sender], "nonce");
        bytes32 digest = keccak256(abi.encode(address(this), block.chainid, msg.sender, amount, nonce));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == signer, "signature");
        nonces[msg.sender] = nonce + 1;
        voucherCredits[msg.sender] += amount;
    }

    function changeOperator(address next) external {
        require(msg.sender == owner, "owner");
        operator = next;
    }

    function upgradeTo(address next) external {
        require(msg.sender == owner, "owner");
        require(next.code.length > 0, "implementation code");
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
        output = amount * marketPrice / 1 ether;
        require(output >= minimumOutput, "slippage");
        tradeCredits[msg.sender] += output;
    }

    function scaledShare(uint256 amount, uint256 total, uint256 shares) external pure returns (uint256) {
        // Fixture values have a bounded product; production full-width math needs a mulDiv review.
        return amount * shares / total;
    }

    function issueCredit(uint256 amount) external payable {
        require(msg.value == amount, "backing");
        issuedCredits[msg.sender] += amount;
    }

    function enqueueMany(uint256 count) external {
        for (uint256 i; i < count; i++) { queue.push(1); }
    }

    function processQueue(uint256 limit) external {
        require(limit > 0 && limit <= 64, "batch limit");
        uint256 end = processed + limit;
        if (end > queue.length) { end = queue.length; }
        uint256 sum = queueTotal;
        for (uint256 i = processed; i < end; i++) { sum += queue[i]; }
        queueTotal = sum;
        processed = end;
    }
}
