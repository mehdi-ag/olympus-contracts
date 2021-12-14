import { writeFileSync, existsSync, readFileSync } from 'fs';
import { deployAndWait, DeployedMandalaContracts, doTxAndWait, gasConfig, gasConfig3, gasConfig4, immediateTx, NewDeployedMandalaContracts, sleep } from '../utils/mandala_helper';
import { ethers } from 'hardhat';
import { Signer, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import Web3 from 'web3';
import { assert, expect } from "chai";
const old_treasury_abi = require("../../abis/old_treasury_abi");
const old_sohm_abi = require("../../abis/sohm");
const frax_abi = require("../../abis/frax");
const dai_abi = require("../../abis/dai");
const wsohm_abi = require("../../abis/wsohm");
const sohm_abi = require("../../abis/sohm");
const ohm_abi = require("../../abis/ohm");
const uni = require("../../abis/uni_factory");
const ohm_frax_lp_abi = require("../../abis/ohm_frax_lp");
const sushi = require("../../abis/sushi_factory");
if (!existsSync('mandala_deployedContracts.json')) {
    console.log('mandala_deployedContracts.json not found');
    process.exit(-1);
}

if (!existsSync('mandalaNEW_deployedContracts.json')) {
    console.log('mandalaNEW_deployedContracts.json not found');
    process.exit(-1);
}

const deployedContracts = JSON.parse(readFileSync('mandala_deployedContracts.json').toString()) as DeployedMandalaContracts;
const deployedContractsNew = JSON.parse(readFileSync('mandalaNEW_deployedContracts.json').toString()) as NewDeployedMandalaContracts;
const user = '0x75E480dB528101a381Ce68544611C169Ad7EB342';
const contracts = { ...deployedContracts, ...deployedContractsNew } as DeployedMandalaContracts & NewDeployedMandalaContracts;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const treasury_tokens = [
    {
        name: "frax",
        address: contracts.FRX,
        abi: frax_abi,
        isReserve: true,
    },
    {
        name: "dai",
        address: contracts.DAI,
        abi: dai_abi,
        isReserve: true,
    },
]
const wsOHMWallet = new Web3('https://tc7-eth.aca-dev.network').eth.accounts.create();
const sohmWallet = new Web3('https://tc7-eth.aca-dev.network').eth.accounts.create();
const ohmWallet = new Web3('https://tc7-eth.aca-dev.network').eth.accounts.create();
const olympus_tokens = [
    {
        name: "wsohm",
        address: contracts.wsOHM,
        abi: wsohm_abi,
        migrationType: 2, // WRAPPED
        wallet: wsOHMWallet.address,
    },
    {
        name: "sohm",
        address: contracts.sOHM,//OLD_SOHM_ADDRESS,
        abi: sohm_abi,
        migrationType: 1, // STAKED
        wallet: sohmWallet.address,
    },
    {
        name: "ohm",
        address: contracts.OHM,//OLD_OHM_ADDRESS,
        abi: ohm_abi,
        migrationType: 0, // UNSTAKED
        wallet: ohmWallet.address,
    },
];

const swaps = [
    {
        name: "uni",
        address: contracts.uniRouter,//UNI_FACTORY,
        abi: uni,
    },
    {
        name: "sushi",
        address: contracts.sushiRouter,//SUSHI_FACTORY,
        abi: sushi,
    },
];

const EPOCH_LEGNTH = 2200;
const DAI_ADDRESS = contracts.DAI;
const SUSHI_ROUTER = contracts.sushiRouter;
const UNISWAP_ROUTER = contracts.uniRouter;
const OLD_OHM_ADDRESS = contracts.OHM;
const OLD_SOHM_ADDRESS = contracts.sOHM;
let TREASURY_MANAGER = contracts.Treasury;
let NON_TOKEN_HOLDER = ZERO_ADDRESS;
let NON_TOKEN_HOLDER_ACC: SignerWithAddress;
const OLD_WSOHM_ADDRESS = contracts.wsOHM;
const OLD_STAKING_ADDRESS = contracts.Staking;
const OLD_TREASURY_ADDRESS = contracts.Treasury;

const tokenAddresses = treasury_tokens.map((token) => token.address);

describe("Treasury Token Migration", async function () {
    this.timeout(14400000); // 4 hours timeout
    let deployer: SignerWithAddress,
        user1: SignerWithAddress,
        manager: SignerWithAddress,
        old_treasury: Contract,
        olympusTokenMigrator: Contract,
        index: any,
        ohm,
        sOhm: Contract,
        gOhm: Contract,
        newTreasury: Contract,
        newStaking: Contract,
        authority: Contract;
    before(async function () {
        [deployer, user1] = await ethers.getSigners();
        NON_TOKEN_HOLDER = user1.address;
        NON_TOKEN_HOLDER_ACC = user1;
        TREASURY_MANAGER = deployer.address;
        console.log({ NON_TOKEN_HOLDER })
        authority = await deployAndWait('OlympusAuthority', [deployer.address, deployer.address, deployer.address, deployer.address, gasConfig3]);

        ohm = await deployAndWait('OlympusERC20Token', [deployer.address, gasConfig3]);
        sOhm = await deployAndWait('sOlympus', [gasConfig3]);


        newTreasury = await deployAndWait('OlympusTreasury', [ohm.address, 10, authority.address, gasConfig3])

        olympusTokenMigrator = await deployAndWait('OlympusTokenMigrator', [OLD_OHM_ADDRESS,
            OLD_SOHM_ADDRESS,
            OLD_TREASURY_ADDRESS,
            OLD_STAKING_ADDRESS,
            OLD_WSOHM_ADDRESS,
            SUSHI_ROUTER,
            UNISWAP_ROUTER,
            1, // timelock for defunds
            authority.address, gasConfig4]);

        const migratorAddress = olympusTokenMigrator.address;

        gOhm = await deployAndWait('gOHM', [migratorAddress, OLD_SOHM_ADDRESS, gasConfig])

        // uncomment everything

        /**
        *  Connect the contracts once they have been deployed
        * */

        // Set gOHM on migrator contract
        await doTxAndWait(`olympusTokenMigrator.setgOHM()`, async () => await olympusTokenMigrator.connect(deployer).setgOHM(gOhm.address, gasConfig3), immediateTx)

        // Setting the vault for new ohm:
        await doTxAndWait(`authority.pushVault()`, async () => await authority.pushVault(newTreasury.address, true, gasConfig3))

        newStaking = await deployAndWait('OlympusStaking', [
            ohm.address,
            sOhm.address,
            gOhm.address,
            EPOCH_LEGNTH,
            0,
            0,
            authority.address,
            gasConfig4]);

        // Initialize staking
        await doTxAndWait(`newStaking.setWarmupLength(0)`, async () => await newStaking.connect(deployer).setWarmupLength(0, gasConfig3))

        // Initialize new sOHM
        const oldSohm = new ethers.Contract(OLD_SOHM_ADDRESS, old_sohm_abi, ethers.provider);
        index = await oldSohm.connect(deployer).index();

        await doTxAndWait(`sOhm.setIndex(${index})`, async () => await sOhm.connect(deployer).setIndex(index, gasConfig3))
        await doTxAndWait(`sOhm.setgOHM(${gOhm.address})`, async () => await sOhm.connect(deployer).setgOHM(gOhm.address, gasConfig3))
        await doTxAndWait(`sOhm.initialize(${newStaking.address, newTreasury.address})`, async () => await sOhm.connect(deployer).initialize(newStaking.address, newTreasury.address, gasConfig3))

        manager = deployer;
        old_treasury = new ethers.Contract(
            OLD_TREASURY_ADDRESS,
            old_treasury_abi,
            ethers.provider
        );


        await setContracts(treasury_tokens);
        await setContracts(olympus_tokens);
        await setContracts(swaps);

        // Give migrator permissions for managing old treasury
        // 1 = RESERVESPENDER
        // 3 = RESERVEMANAGER
        // 6 = LIQUIDITYMANAGER
        await doTxAndWait(`old_treasury.queue(1)`, async () => await old_treasury.connect(manager).queue(1, migratorAddress, gasConfig3));
        await doTxAndWait(`old_treasury.queue(3)`, async () => await old_treasury.connect(manager).queue(3, migratorAddress, gasConfig3));
        await doTxAndWait(`old_treasury.queue(6)`, async () => await old_treasury.connect(manager).queue(6, migratorAddress, gasConfig3));

    })

    it("Should fail if sender is not DAO", async () => {
        let err = undefined;
        try {
            await sendETH(deployer, user1.address)
            await sleep(25000)
            let token = treasury_tokens[0];
            await olympusTokenMigrator.connect(user1).migrateToken(token.address, gasConfig3)
        } catch (e) {
            err = (e as any).toString();
        }
        expect(err).is.not.undefined;
        if (err) console.log(`Successfully got error: ${err}`);

        err = undefined;
        let lpToken = {
            name: "ohm_frax",
            address: '0x2dcE0dDa1C2f98e0F171DE8333c3c6Fe1BbF4877',
            token0: contracts.FRX,
            token1: contracts.OHM,
            is_sushi: false,
            abi: ohm_frax_lp_abi,
            isLP: true,
        };
        await sleep(25000)
        try {


            await olympusTokenMigrator
                .connect(user1)
                .migrateLP(lpToken.address, lpToken.is_sushi, lpToken.token0, 0, 0, gasConfig3)
        } catch (e) {
            err = (e as any).toString();
        }
        expect(err).is.not.undefined;
        if (err) console.log(`Successfully got error: ${err}`);
        await sleep(25000);
    });
    it("Should fail if user does not have any of the ohm tokens to migrate ", async () => {
        let err = undefined;
        try {
            await sendETH(deployer, NON_TOKEN_HOLDER);
            await sleep(25000);
            const user = NON_TOKEN_HOLDER_ACC;
            // Using safeTransferFrom so generic safeERC20 error message
            await olympusTokenMigrator.connect(user).migrate(1000000, 1, 2, gasConfig3);
        } catch (e) {
            err = (e as any).toString();
        }
        expect(err).is.not.undefined;
        if (err) console.log(`Successfully got error: ${err}`);
        await sleep(25000);
    });

    it("Should fail if user does not have any of the ohm tokens to bridge back ", async () => {
        let err = undefined;
        try {
            await sendETH(deployer, NON_TOKEN_HOLDER);
            await sleep(15000);
            const user = NON_TOKEN_HOLDER_ACC;
            await (olympusTokenMigrator.connect(user).bridgeBack(1000000, 0, gasConfig3))
        } catch (e) {
            err = (e as any).toString();
        }
        expect(err).is.not.undefined;
        if (err) console.log(`Successfully got error: ${err}`);
        await sleep(25000);
    });


    describe("Withdraw Functions", async () => {
        it("should fail if the caller isn't the deployer", async () => {
            await sleep(25000);
            let err = undefined;
            try {
                await
                    olympusTokenMigrator
                        .connect(user1)
                        .withdrawToken(DAI_ADDRESS, 1, ZERO_ADDRESS, gasConfig3);
            } catch (e) {
                err = (e as any).toString();
            }
            expect(err).is.not.undefined;
            if (err) console.log(`Successfully got error: ${err}`);
            await sleep(25000);
        });

        it("should be able to withdraw sent dai", async () => {
            const daiToken = treasury_tokens.find((token) => token.name == "dai") as any;
            // const daiHolder = await impersonate(addresses.DAI_HOLDER);
            const daiAmount = 420;
            const daiTokenContract = daiToken?.contract;
            await expect(daiTokenContract).to.not.be.null;

            const migratorDaiBalanceBefore = await daiTokenContract.balanceOf(
                olympusTokenMigrator.address
            );
            // Send dai to address
            await doTxAndWait(`daiTokenContract.approve()`, async () =>
                await daiTokenContract
                    .connect(deployer)
                    .approve(olympusTokenMigrator.address, daiAmount, gasConfig3));
            await sleep(5000);
            await doTxAndWait(`daiTokenContract.transfer()`, async () =>
                await daiTokenContract
                    .connect(deployer)
                    .transfer(olympusTokenMigrator.address, daiAmount, gasConfig3));
            await sleep(5000);

            const migratorDaiBalance = await daiTokenContract.balanceOf(
                olympusTokenMigrator.address
            );
            
            expect(+migratorDaiBalance).to.be.gte(+migratorDaiBalanceBefore);
            // withdraw dai
            await sleep(5000);
            await doTxAndWait(`daiTokenContract.withdrawToken()`, async () =>
                await olympusTokenMigrator
                    .connect(deployer)
                    .withdrawToken(DAI_ADDRESS, daiAmount, deployer.address, gasConfig));
        });

        it("should not be able to send eth to the contract", async () => {
            let err = undefined;
            try {
                const provider = ethers.provider;
                const startingEthBal = await provider.getBalance(user1.address);
                await
                    user1.sendTransaction({
                        to: olympusTokenMigrator.address,
                        value: ethers.utils.parseEther('1'), // 1 ether
                        ...gasConfig3
                    })
            } catch (e) {
                err = (e as any).toString();
            }
            expect(err).is.not.undefined;
            if (err) console.log(`Successfully got error: ${err}`);
        });
    });

    describe("Olympus Token Migrations", async () => {
        let sOHMindex = 1;

        function toGohm(sohmAmount: any) {
            return sohmAmount.mul(10 ** 9).div(sOHMindex);
        }

        async function performBridgeBack(token: any) {
            const { wallet, contract, migrationType } = token;
            let oldgOhmBalance = await gOhm.balanceOf(wallet);
            await sleep(5000);
            const user = deployer; //await impersonate(wallet);
            await doTxAndWait(`olympusTokenMigrator.approve()`, async () =>
                await gOhm.connect(user).approve(olympusTokenMigrator.address, oldgOhmBalance, gasConfig3));
            await sleep(5000);
            await doTxAndWait(`olympusTokenMigrator.bridgeBack()`, async () =>
                await olympusTokenMigrator.connect(user).bridgeBack(oldgOhmBalance, migrationType, gasConfig3));

            await sleep(5000);
            let newTokenBalance = await contract.balanceOf(wallet);

            return { oldgOhmBalance, newTokenBalance };
        }

        before(async () => {
            sOHMindex = index;
            for (let i = 0; i < olympus_tokens.length; i++) {
                const { wallet } = olympus_tokens[i];
                await sendETH(deployer, wallet);
            }
        });
        it("should migrate sohm", async () => {
            const token = olympus_tokens.find((token) => token.name === "sohm");
            const { oldTokenBalance, newgOhmBalance } = await performMigration(token);

            let gohmBalanceOld = toGohm(oldTokenBalance).toString();
            let gohmBalanceNew = newgOhmBalance.toString().slice(0, 11); //Hacky shit bruh

            assert.equal(gohmBalanceOld, gohmBalanceNew);
        });
        it("should migrate wsOhm", async () => {
            const token = olympus_tokens.find((token) => token.name === "wsohm");
            const { oldTokenBalance, newgOhmBalance } = await performMigration(token);

            assert.equal(
                newgOhmBalance.toString(),
                oldTokenBalance.toString(),
                "New gOhm balance does not equal tokenBalance on migrate"
            );
        });

        it("should bridgeBack ohm", async () => {
            const token = olympus_tokens.find((token) => token.name === "ohm");
            const { oldgOhmBalance, newTokenBalance } = await performBridgeBack(token);

            let gohmBalanceOld = oldgOhmBalance.toString().slice(0, 10); //Hacky shit bruh
            let gohmBalanceNew = toGohm(newTokenBalance).toString();

            assert.equal(gohmBalanceOld, gohmBalanceNew);
        });
        it("should bridgeBack sOhm", async () => {
            const token = olympus_tokens.find((token) => token.name === "sohm");
            const { oldgOhmBalance, newTokenBalance } = await performBridgeBack(token);

            let gohmBalanceOld = oldgOhmBalance.toString().slice(0, 11); //Hacky shit bruh
            let gohmBalanceNew = toGohm(newTokenBalance).toString();

            assert.equal(gohmBalanceOld, gohmBalanceNew);
        });
        it("should bridgeBack gOhm", async () => {
            const token = olympus_tokens.find((token) => token.name === "wsohm");
            const { oldgOhmBalance, newTokenBalance } = await performBridgeBack(token);

            assert.equal(
                oldgOhmBalance.toString(),
                newTokenBalance.toString(),
                "New gOhm balance does not equal tokenBalance on bridgeBack"
            );
        });
    });
    async function performMigration(token: any) {
        const { wallet, contract, migrationType } = token;
        let oldTokenBalance = await contract.balanceOf(wallet);

        const user = deployer; //await impersonate(wallet);

        sleep(5000);
        await doTxAndWait(`tokenContract.approve()`, async () =>
            await contract.connect(user).approve(olympusTokenMigrator.address, oldTokenBalance, gasConfig3));
        sleep(5000);
        await doTxAndWait(`olympusTokenMigrator.migrate()`, async () =>
            await olympusTokenMigrator.connect(user).migrate(oldTokenBalance, migrationType, 2, gasConfig3)); // to gOHM

        sleep(5000);
        let newgOhmBalance = await gOhm.balanceOf(wallet);
        return { oldTokenBalance, newgOhmBalance };
    }
})

async function sendETH(deployer: Signer, address: string, amount?: string, _gasConfig = gasConfig4) {
    let i = 0;
    try {
        amount = amount || "10";
        console.log(`Sending ${amount} ETH to ${address}`);
        for (i = 0; i < parseInt(amount); i++) {
            const res = await deployer.sendTransaction({
                to: address,
                value: ethers.utils.parseEther('1'), // 1 ether
                ..._gasConfig
            });
            console.log(`Sending 1 ETH to ${address}`);
            await sleep(15000);
        }
        console.log(`TotalSent ${amount} ETH to ${address}`);
    } catch (e) {
        console.log('failed to send ETH, sleeping for 15seconds');
        await sleep(15000);
        console.log('sendETH reverting back...');

    }
    console.log(`TotalSent ${i} ETH to ${address}`);
    // res.wait();
}

async function setContracts(array: any) {
    array.forEach((token: any) => {
        token.contract = new ethers.Contract(token.address, token.abi, ethers.provider);
    });
}
