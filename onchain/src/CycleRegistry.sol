// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CycleRegistry
/// @notice On-chain attestation of TruthBounty Agora decision cycles, on Arc.
/// Each cycle the agent records a hash of its reasoning thesis plus the allocation
/// outcome. This makes the reasoning trace itself a verifiable on-chain artifact
/// (cf. Arc Research #01 — "the reasoning trace is the product") and gives every
/// autonomous cycle a real, cheap Arc settlement, gas paid in USDC.
contract CycleRegistry {
    event CycleAttested(
        uint256 indexed index,
        address indexed agent,
        bytes32 thesisHash,
        uint256 allocatedUsdcE6,
        uint256 reservedUsdcE6,
        uint256 copies,
        uint256 skips,
        string model
    );

    uint256 public cycleCount;

    /// @notice Record one agent decision cycle. Returns its sequential index.
    function attest(
        bytes32 thesisHash,
        uint256 allocatedUsdcE6,
        uint256 reservedUsdcE6,
        uint256 copies,
        uint256 skips,
        string calldata model
    ) external returns (uint256 index) {
        index = cycleCount++;
        emit CycleAttested(
            index, msg.sender, thesisHash, allocatedUsdcE6, reservedUsdcE6, copies, skips, model
        );
    }
}
