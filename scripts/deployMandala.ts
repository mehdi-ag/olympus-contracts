const { ethers } = require("hardhat");
import { deployContract } from 'ethereum-waffle';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { deployAndWait, DeployedMandalaContracts, gasConfig, gasConfig2, gasConfig3, gasConfig4, NewDeployedMandalaContracts } from '../test/utils/mandala_helper';
async function main() {
    if (!existsSync('mandala_deployedContracts.json')) {
        console.log('mandala_deployedContracts.json not found');
        return;
    }

    const [deployer] = await ethers.getSigners();
    console.log('Deploying contracts with the account: ' + deployer.address);
    const deployedContracts = JSON.parse(readFileSync('mandala_deployedContracts.json').toString()) as DeployedMandalaContracts;
    const { OHM, DAI, FRX, Treasury, Calc, Staking, sOHM, Distributor, StakingWarmup, StakingHelper, DAIBond, FRXBond } = deployedContracts;
    const newDeployedContracts = (existsSync('mandalaNEW_deployedContracts.json') ?
        JSON.parse(readFileSync('mandalaNEW_deployedContracts.json').toString() || '{}') :
        {}) as NewDeployedMandalaContracts;

    // Taken from deployOldwsOHM.js
    const wsOHM = await deployAndWait('wOHM', [sOHM, gasConfig]);
    newDeployedContracts.wsOHM = wsOHM.address;

    // Taken from deployTokenMigrator.js
    const authorityAddress = deployer.address;
    const authority = await deployAndWait('OlympusAuthority', [authorityAddress, authorityAddress, authorityAddress, authorityAddress, gasConfig3]);
    newDeployedContracts.authority = authority.address;

    // Deploying mock uniswap routers
    const sushiRouter = await deployAndWait('TestUniswapV2Router', [gasConfig]);
    newDeployedContracts.sushiRouter = sushiRouter.address;

    const uniRouter = await deployAndWait('TestUniswapV2Router', [gasConfig]);
    newDeployedContracts.uniRouter = uniRouter.address;

    const migrator = await deployAndWait('OlympusTokenMigrator', [OHM, sOHM, Treasury, Staking, wsOHM, sushiRouter.address, uniRouter.address, '0', authority.address, gasConfig4]);
    newDeployedContracts.migrator = migrator.address;

    const gOHM = await deployAndWait('gOHM', [migrator.address, sOHM, gasConfig]);
    newDeployedContracts.gOHM = gOHM.address;

    writeFileSync('mandalaNEW_deployedContracts.json', JSON.stringify(newDeployedContracts))
}

main()
    .then(() => process.exit())
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

