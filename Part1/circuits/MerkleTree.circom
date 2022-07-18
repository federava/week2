pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    // Need to hash n-1 levels
    component hl[n-1];

    // Loop through each level of the tree
    for (var i=0; i<(n-1); i++) {
        // Each level size decreases is halved as the level increases
        hl[i] = HashList(2**(n-i));
        for( var j=0; j<2**(n-i); j++) {
            // First list inputs are the leaves to be hashed, the other levels use the output of the previous levels as inputs
            hl[i].list[j] <== i == 0 ? leaves[j] : hl[i-1].out[j];
        }
    }

    root <== hl[n-1].out[0];
}

// Template that takes a list of n values and returns a size n/2 list of the hashes of pairs of consecutive elements.
template HashList(n) {
    signal input list[n];
    signal output out[n/2];

    assert(n%2 == 0);

    component pos[n/2];
    
    for(var i=0; i<n/2; i++) {
        pos[i] = Poseidon(2);
        pos[i].inputs[0] <== list[2*i];
        pos[i].inputs[1] <== list[2*i+1];
        out[i] <== pos.out;
    }
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    // For computing the root through the path we will need to use Poseidon hash and the MUX template n times
    component pos[n];
    component selector[n];

    for(var i=0; i<n; i++) {
        //DualMux: inputs in 2 signals and outputs 2 signals. If input "s" is 1, the output is with the order inverted.
        selector[i] = DualMux();
        selector[i].in[0] <== i == 0 ? leaf : pos[i-1].out;
        selector[i].in[1] <== path_elements[i];
        selector[i].s <== path_index[i];

        pos[i] = Poseidon(2);
        pos[i].inputs[0] <== selector[i].out[0];
        pos[i].inputs[1] <== selector[i].out[1];
    }
    root <== pos[n-1].out;
}

// if s == 0 returns [in[0], in[1]]
// if s == 1 returns [in[1], in[0]]
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0])*s + in[0];
    out[1] <== (in[0] - in[1])*s + in[1];
}