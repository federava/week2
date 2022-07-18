//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        // Eight blank leaves
        for (uint i = 0; i < 8; i++) {
            hashes.push(0);
        }

        // Amount of leaves (8)
        uint n = hashes.length;
        uint offset = 0;

        while (n > 0) {
            // Loops over each level hashing consecutive pair of elements and pushing it to the array until the root is created
            for (uint i = 0; i < n - 1; i += 2) {
                hashes.push(PoseidonT3.poseidon([hashes[offset + i], hashes[offset + i + 1]]));
            }
            // Keep track of the offset for the array
            offset += n;
            // Helps update the offset and defines the amount of loops in the while
            n = n / 2;
        }

        root = hashes[hashes.length - 1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        //Max eight leaves
        require(index < 8);
        uint currentIndex = index;
        uint currentLevelHash = hashedLeaf;
        uint left;
        uint right;
        
        // Length of leaves
        uint n = (hashes.length + 1)/2;
        uint offset = 0;
        while (n > 1) {
            // offset + currentIndex gives the position in the array
            if(currentIndex % 2 == 0) {
                // Even index goes to the left. Get the next element in the array and put it in the right.
                left = currentLevelHash;
                right = hashes[offset + currentIndex + 1];
            } else {
                // Odd index goes to the right. Get the previous element in the array and put it in the left.
                left =  hashes[offset + currentIndex - 1];
                right = currentLevelHash;
            }
            // Before hashing again set the current node to the last hash
            hashes[offset + currentIndex] = currentLevelHash;
            // Hash the corresponding elements
            currentLevelHash = PoseidonT3.poseidon([left, right]);
            // Integer division by 2 for next current index
            currentIndex /= 2;
            // Keep track of the offset for the array
            offset += n;
            // Helps update the offset and defines the amount of loops in the while
            n = n / 2;
        }

        // Update index for next call of this function
        index++;

        root = currentLevelHash;

        return root;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        if(verifyProof(a, b, c, input) && root == input[0]) {
            return true;
        } else {
            return false;
        }
    }
}
