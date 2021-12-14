// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { calcEthereumTransactionParams } from '@acala-network/eth-providers';
import { Contract } from 'ethers';
import { writeFileSync, existsSync, readFileSync } from 'fs';
const txFeePerGas = '199999946752';
const storageByteDeposit = '100000000000000';
async function main() {
    const [deployer] = await ethers.getSigners();
    const MockDAO = deployer;

    const gasConfig = generateGasConfig('4100001')
    const gasConfig2 = generateGasConfig('2100001')
    const gasConfig3 = generateGasConfig('6100001')
    const gasConfig4 = generateGasConfig('8100001')


    console.log('Deploying contracts with the account: ' + deployer.address);

    // Initial staking index
    const initialIndex = '7675210820';

    // First block epoch occurs
    const firstEpochBlock = '8961000';

    // What epoch will be first epoch
    const firstEpochNumber = '338';

    // How many blocks are in each epoch
    const epochLengthInBlocks = '2200';

    // Initial reward rate for epoch
    const initialRewardRate = '3000';

    // Ethereum 0 address, used when toggling changes in treasury
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    // Large number for approval for Frax and DAI
    const largeApproval = '100000000000000000000000000000000';

    // Initial mint for Frax and DAI (10,000,000)
    const initialMint = '10000000000000000000000000';

    // DAI bond BCV
    const daiBondBCV = '369';

    // Frax bond BCV
    const fraxBondBCV = '690';

    // Bond vesting length in blocks. 33110 ~ 5 days
    const bondVestingLength = '33110';

    // Min bond price
    const minBondPrice = '50000';

    // Max bond payout
    const maxBondPayout = '50'

    // DAO fee for bond
    const bondFee = '10000';

    // Max debt bond can take on
    const maxBondDebt = '1000000000000000';

    // Initial Bond debt
    const intialBondDebt = '0'

    // Deploy OHM
    const ohm = await deployAndWait('OlympusERC20Token', [gasConfig]);

    // Deploy DAI
    const dai = await deployAndWait('DAI', [0, gasConfig2]);

    // Deploy Frax
    const frax = await deployAndWait('FRAX', [0, gasConfig2]);

    // Deploy 10,000,000 mock DAI and mock Frax
    await doTxAndWait('dai.mint()', async () => await dai.mint(deployer.address, initialMint, gasConfig2))

    await doTxAndWait('frax.mint()', async () => await frax.mint(deployer.address, initialMint, gasConfig3))

    // Deploy treasury
    //@dev changed function in treaury from 'valueOf' to 'valueOfToken'... solidity function was coflicting w js object property name
    const treasury = await deployAndWait('MockOlympusTreasury', [ohm.address, dai.address, frax.address, 0, gasConfig3]);

    // Deploy bonding calc
    const olympusBondingCalculator = await deployAndWait('OlympusBondingCalculator', [ohm.address, gasConfig2]);

    // Deploy staking distributor
    const distributor = await deployAndWait('Distributor', [treasury.address, ohm.address, epochLengthInBlocks, firstEpochBlock, gasConfig2]);

    // Deploy sOHM
    const sOHM = await deployAndWait('sOlympus', [gasConfig3]);

    // Deploy Staking
    const staking = await deployAndWait('OlympusStaking', [ohm.address, sOHM.address, epochLengthInBlocks, firstEpochNumber, firstEpochBlock, gasConfig4]);

    // Deploy staking warmpup
    const stakingWarmup = await deployAndWait('StakingWarmup', [staking.address, sOHM.address, gasConfig4]);

    // Deploy staking helper
    const stakingHelper = await deployAndWait('StakingHelper', [staking.address, ohm.address, gasConfig3]);

    // Deploy DAI bond
    //@dev changed function call to Treasury of 'valueOf' to 'valueOfToken' in BondDepository due to change in Treausry contract
    const daiBond = await deployAndWait('MockOlympusBondDepository', [ohm.address, dai.address, treasury.address, MockDAO.address, zeroAddress, gasConfig4]);

    // Deploy Frax bond
    //@dev changed function call to Treasury of 'valueOf' to 'valueOfToken' in BondDepository due to change in Treausry contract
    const fraxBond = await deployAndWait('MockOlympusBondDepository', [ohm.address, frax.address, treasury.address, MockDAO.address, zeroAddress, gasConfig3]);


    // queue and toggle DAI and Frax bond reserve depositor
    await doTxAndWait(`treasury.queue(0,${daiBond.address})`, async () => await treasury.queue('0', daiBond.address, gasConfig3));
    await doTxAndWait(`treasury.queue(0,${fraxBond.address})`, async () => await treasury.queue('0', fraxBond.address, gasConfig3));
    await doTxAndWait(`treasury.toggle(0,${daiBond.address})`, async () => await treasury.toggle('0', daiBond.address, zeroAddress, gasConfig3));
    await doTxAndWait(`treasury.toggle(0,${fraxBond.address})`, async () => await treasury.toggle('0', fraxBond.address, zeroAddress, gasConfig3));


    // Set DAI and Frax bond terms
    await doTxAndWait(`daiBond.initializeBondTerms()`, async () => await daiBond.initializeBondTerms(daiBondBCV, bondVestingLength, minBondPrice, maxBondPayout, bondFee, maxBondDebt, intialBondDebt, gasConfig3));
    await doTxAndWait(`fraxBond.initializeBondTerms`, async () => await fraxBond.initializeBondTerms(fraxBondBCV, bondVestingLength, minBondPrice, maxBondPayout, bondFee, maxBondDebt, intialBondDebt, gasConfig3));


    // Set staking for DAI and Frax bond
    await doTxAndWait(`daiBond.setStaking()`, async () => await daiBond.setStaking(staking.address, stakingHelper.address, gasConfig3));
    await doTxAndWait(`fraxBond.setStaking()`, async () => await fraxBond.setStaking(staking.address, stakingHelper.address, gasConfig3));

    // Initialize sOHM and set the index
    await doTxAndWait(`sOHM.initialize()`, async () => await sOHM.initialize(staking.address, gasConfig3));
    await doTxAndWait(`sOHM.setIndex()`, async () => await sOHM.setIndex(initialIndex, gasConfig3));

    // set distributor contract and warmup contract
    await doTxAndWait(`staking.setContract(0)`, async () => await staking.setContract('0', distributor.address, gasConfig3));
    await doTxAndWait(`staking.setContract(1)`, async () => await staking.setContract('1', stakingWarmup.address, gasConfig3));

    // Set treasury for OHM token
    await doTxAndWait(`ohm.setVault()`, async () => await ohm.setVault(treasury.address, gasConfig3));

    // Add staking contract as distributor recipient
    await doTxAndWait(`distributor.addRecipient()`, async () => await distributor.addRecipient(staking.address, initialRewardRate, gasConfig3));

    // queue and toggle reward manager
    await doTxAndWait(`treasury.queue(8)`, async () => await treasury.queue('8', distributor.address, gasConfig3));
    await doTxAndWait(`treasury.toogle(8)`, async () => await treasury.toggle('8', distributor.address, zeroAddress, gasConfig3));

    // queue and toggle deployer reserve depositor
    await doTxAndWait(`treasury.queue(0)`, async () => await treasury.queue('0', deployer.address, gasConfig3));
    await doTxAndWait(`treasury.toogle(0)`, async () => await treasury.toggle('0', deployer.address, zeroAddress, gasConfig3));

    // queue and toggle liquidity depositor
    await doTxAndWait(`treasury.queue(4)`, async () => await treasury.queue('4', deployer.address, gasConfig3));
    await doTxAndWait(`treasury.toogle(4)`, async () => await treasury.toggle('4', deployer.address, zeroAddress, gasConfig3));

    // Approve the treasury to spend DAI and Frax
    await doTxAndWait(`dai.approve()`, async () => await dai.approve(treasury.address, largeApproval, gasConfig3));
    await doTxAndWait(`frax.approve()`, async () => await frax.approve(treasury.address, largeApproval, gasConfig3));

    // Approve dai and frax bonds to spend deployer's DAI and Frax
    await doTxAndWait(`dai.approve(dai)`, async () => await dai.approve(daiBond.address, largeApproval, gasConfig3));
    await doTxAndWait(`frax.approve(frax)`, async () => await frax.approve(fraxBond.address, largeApproval, gasConfig3));

    // Approve staking and staking helper contact to spend deployer's OHM
    await doTxAndWait(`ohm.approve(staking)`, async () => await ohm.approve(staking.address, largeApproval, gasConfig3));
    await doTxAndWait(`ohm.approve(stakingHelper)`, async () => await ohm.approve(stakingHelper.address, largeApproval, gasConfig3));

    // Deposit 9,000,000 DAI to treasury, 600,000 OHM gets minted to deployer and 8,400,000 are in treasury as excesss reserves
    await doTxAndWait(`treasury.deposit(9e24)`, async () => await treasury.deposit('9000000000000000000000000', dai.address, '8400000000000000', gasConfig4));

    // Deposit 5,000,000 Frax to treasury, all is profit and goes as excess reserves
    await doTxAndWait(`treasury.deposit(5e24)`, async () => await treasury.deposit('5000000000000000000000000', frax.address, '5000000000000000', gasConfig4));

    // Stake OHM through helper
    await doTxAndWait(`stakingHelper.stake()`, async () => await stakingHelper.stake('100000000000', gasConfig4));

    // Bond 1,000 OHM and Frax in each of their bonds
    await doTxAndWait(`daiBond.deposit()`, async () => await daiBond.deposit('1000000000000000000000', '60000', deployer.address, gasConfig4));
    await doTxAndWait(`fraxBond.deposit()`, async () => await fraxBond.deposit('1000000000000000000000', '60000', deployer.address, gasConfig4));




    console.log("OHM: " + ohm.address);
    console.log("DAI: " + dai.address);
    console.log("Frax: " + frax.address);
    console.log("Treasury: " + treasury.address);
    console.log("Calc: " + olympusBondingCalculator.address);
    console.log("Staking: " + staking.address);
    console.log("sOHM: " + sOHM.address);
    console.log("Distributor " + distributor.address);
    console.log("Staking Warmup " + stakingWarmup.address);
    console.log("Staking Helper " + stakingHelper.address);
    console.log("DAI Bond: " + daiBond.address);
    console.log("Frax Bond: " + fraxBond.address);

    const deployedContracts = {
        OHM: ohm.address,
        DAI: dai.address,
        FRX: frax.address,
        Treasury: treasury.address,
        Calc: olympusBondingCalculator.address,
        Staking: staking.address,
        sOHM: sOHM.address,
        Distributor: distributor.address,
        StakingWarmup: stakingWarmup.address,
        StakingHelper: stakingHelper.address,
        DAIBond: daiBond.address,
        FRXBond: fraxBond.address
    };

    writeFileSync('mandala_deployedContracts.json', JSON.stringify(deployedContracts));

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const generateGasConfig = (gasLimit: string) => {
    const ethParams = calcEthereumTransactionParams({
        gasLimit: gasLimit,
        validUntil: '360001',
        storageLimit: '64001',
        txFeePerGas,
        storageByteDeposit
    });
    return {
        gasPrice: ethParams.txGasPrice,
        gasLimit: ethParams.txGasLimit
    }
}

const deployAndWait = async (contractName: string, params: any[], waitConfig = {
    beforeTime: 15000,
    afterTime: 5000,
    maxRetries: 5
}, currentTry = 0): Promise<Contract> => {
    try {
        console.log(`Deploying ${contractName} after waiting ${waitConfig.beforeTime}ms ${currentTry > 0 ? `retryCount: ${currentTry}` : ''}`);
        await sleep(waitConfig.beforeTime);
        const Contract = await ethers.getContractFactory(contractName);
        console.log(`Deploying ${contractName}...`);
        const contract = await Contract.deploy(...params);
        console.log(`Deployed ${contractName} at ${contract.address}`);
        console.log(`Waiting ${waitConfig.afterTime}ms for cooldown`);
        await sleep(waitConfig.afterTime);
        await contract.deployed();
        return contract;
    } catch (error) {
        console.log(`Error deploying ${contractName}`);
        // console.log(error);
        if (currentTry < waitConfig.maxRetries) {
            console.log(`Retrying deployment of ${contractName}`);
            return deployAndWait(contractName, params, waitConfig, currentTry + 1);
        } else {
            throw error;
        }
    }
}

const doTxAndWait = async (friendlyName = '', fn: Function, waitConfig = {
    beforeTime: 15000,
    afterTime: 5000,
    maxRetries: 5
}, currentTry = 0): Promise<any> => {
    try {
        console.log(`Waiting ${waitConfig.beforeTime}ms before transaction ${currentTry > 0 ? `retryCount: ${currentTry}` : ''}`);
        await sleep(waitConfig.beforeTime);
        console.log(`Executing transaction ${friendlyName}...`);
        const tx = await fn();
        console.log(`Transaction executed. Waiting ${waitConfig.afterTime}ms for cooldown`);
        await sleep(waitConfig.afterTime);
        const resp = await tx.wait();
        return resp;
    } catch (error) {
        console.log(`Error executing transaction ${friendlyName}`);
        // console.log(error);
        if (currentTry < waitConfig.maxRetries) {
            console.log(`Retrying transaction ${friendlyName}`);
            return doTxAndWait(friendlyName, fn, waitConfig, currentTry + 1);
        } else {
            console.log(error)
            // throw error;
        }
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));