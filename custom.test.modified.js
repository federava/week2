// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
      // [assignment] complete code here
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const aliceKeypair = new Keypair() // contains private and public keys
  
      // Alice deposits into tornado pool
      const aliceDepositAmount = utils.parseEther('0.1')
      const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })
  
      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })
  
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      // emulating bridge. first it sends tokens to omnibridge mock then it sends to the pool
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
  
      await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, // send tokens to pool
        { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])
  
      // withdraws a part of his funds from the shielded pool
      const aliceWithdrawAmount = utils.parseEther('0.08')
      // The recipient in this case is a wallet of Alice
      const recipient = '0xDeAD0000000000000000000000000000000a71CE'
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(aliceWithdrawAmount),
        keypair: aliceKeypair,
      })
      
      await transaction({
        tornadoPool,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo],
        recipient: recipient,
        // Withdrawal takes place in L2, this means that a recipient account will receive aliceWithdrawAmount.
        isL1Withdrawal: false,
      })
      
      // Alice withdraws 0.08 ETH to an L2 recipient account (one wallet of Alice)
      const recipientBalance = await token.balanceOf(recipient)
      //console.log("recipientBalance", utils.formatEther(recipientBalance))
      expect(recipientBalance).to.be.equal(aliceWithdrawAmount)

      // The balance in tornadoPool must be 0.02, that is the same as the deposit amount minus the withdraw amount.
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      //console.log("tornadoPoolBalance", utils.formatEther(tornadoPoolBalance))
      expect(tornadoPoolBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))

      // No funds are withdrawn in L1, so the bridge balance must be equal to zero.
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      //console.log("omniBridgeBalance", utils.formatEther(omniBridgeBalance))
      expect(omniBridgeBalance).to.be.equal(0)
  })

  it('[assignment] iii. see assignment doc for details', async () => {
      // [assignment] complete code here
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const aliceKeypair = new Keypair() // contains private and public keys
  
      // Alice deposits into tornado pool
      const aliceDepositAmount = utils.parseEther('0.13')
      const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })
  
      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })
  
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      // emulating bridge. first it sends tokens to omnibridge mock then it sends to the pool
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
  
      await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, // send tokens to pool
        { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])

      // Bob gives Alice address to send some eth inside the shielded pool
      const bobKeypair = new Keypair() // contains private and public keys
      const bobAddress = bobKeypair.address() // contains only public key
  
      // Alice sends some funds to Bob
      const bobSendAmount = utils.parseEther('0.06')
      const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) })
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(bobSendAmount),
        keypair: aliceKeypair,
      })
      await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [bobSendUtxo, aliceChangeUtxo] })
  
      // Bob parses chain to detect incoming funds
      const filter = tornadoPool.filters.NewCommitment()
      const fromBlock = await ethers.provider.getBlock()
      const events = await tornadoPool.queryFilter(filter, fromBlock.number)
      let bobReceiveUtxo
      try {
        bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
      } catch (e) {
        // we try to decrypt another output here because it shuffles outputs before sending to blockchain
        bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
      }
      expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount)
  
      // Bob withdraws a part of his funds from the shielded pool
      const bobWithdrawAmount = utils.parseEther('0.06')
      const bobEthAddress = '0xdEAD000000000000000000000000000000000B0b'
      const bobChangeUtxo = new Utxo({ amount: bobSendAmount.sub(bobWithdrawAmount), keypair: bobKeypair })
      await transaction({
        tornadoPool,
        inputs: [bobReceiveUtxo],
        outputs: [bobChangeUtxo],
        recipient: bobEthAddress,
        isL1Withdrawal: false
      })

      // The recipient in this case is a wallet of Alice
      const aliceEthAddress = '0xDeAD0000000000000000000000000000000a71CE'
      const aliceWithdrawalUtxo = new Utxo({
        // Alice wants to withdraw her remainig funds () to L1, so her transaction will output 0 ETH in the pool.
        amount: 0,
        keypair: aliceKeypair,
      })

      await transaction({
        tornadoPool,
        inputs: [aliceChangeUtxo],
        outputs: [aliceWithdrawalUtxo],
        recipient: aliceEthAddress,
        // Withdrawal takes place in L1, this means that the omni bridge will receive the funds.
        isL1Withdrawal: true
      })

      // Bob withdraws in L2 and he gets 0.06 ETH
      const bobBalanceL2 = await token.balanceOf(bobEthAddress)
      //console.log("bobBalanceL2", utils.formatEther(bobBalanceL2))
      expect(bobBalanceL2).to.be.equal(bobWithdrawAmount)
      
      // The balance in tornadoPool must be 0 because all ETH have been withdrawed
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      //console.log("tornadoPoolBalance", utils.formatEther(tornadoPoolBalance))
      expect(tornadoPoolBalance).to.be.equal(0)

      // Alice withdraws in L1, so the omni bridge should have the 0.07 ETH
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      //console.log("omniBridgeBalance", utils.formatEther(omniBridgeBalance))
      expect(omniBridgeBalance).to.be.equal(aliceDepositAmount.sub(bobSendAmount))

      // Alice should not have balance in L2, she spent her balance sending it to Bob and withdrawing in L1.
      const aliceBalanceL2 = await token.balanceOf(aliceEthAddress)
      //console.log("aliceBalanceL2", utils.formatEther(aliceBalanceL2))
      expect(aliceBalanceL2).to.be.equal(0)
  })
})