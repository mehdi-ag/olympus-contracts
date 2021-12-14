import { calcEthereumTransactionParams } from '@acala-network/eth-providers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
const txFeePerGas = '199999946752';
const storageByteDeposit = '100000000000000';

export const generateGasConfig = (gasLimit: string) => {
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

export const deployAndWait = async (contractName: string, params: any[], waitConfig = {
    beforeTime: 20000,
    afterTime: 10000,
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

export const doTxAndWait = async (friendlyName = '', fn: Function, waitConfig = {
    beforeTime: 15000,
    afterTime: 5000,
    maxRetries: 5
}, currentTry = 0): Promise<any> => {
    try {
        console.log(`Waiting ${waitConfig.beforeTime}ms before transaction ${currentTry > 0 ? `retryCount: ${currentTry}` : ''}`);
        await sleep(waitConfig.beforeTime);
        console.log(`Executing transaction ${friendlyName}...`);
        const tx = await fn();
        console.log(`Transaction executed.${waitConfig.afterTime > 0 ? ` Waiting ${waitConfig.afterTime} ms for cooldown` : ``}`);
        if (waitConfig.afterTime === -1)
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
            if (waitConfig.maxRetries === -1)
                throw error;
            console.log(error)
        }
    }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const gasConfig = generateGasConfig('4100001')
export const gasConfig2 = generateGasConfig('2100001')
export const gasConfig3 = generateGasConfig('6100001')
export const gasConfig4 = generateGasConfig('8100001')

export const immediateTx = {
    beforeTime: 0,
    afterTime: -1,
    maxRetries: -1
}

export interface DeployedMandalaContracts {
    OHM: string;
    DAI: string;
    FRX: string;
    Treasury: string;
    Calc: string;
    Staking: string;
    sOHM: string;
    Distributor: string;
    StakingWarmup: string;
    StakingHelper: string;
    DAIBond: string;
    FRXBond: string;
}

export interface NewDeployedMandalaContracts {
    wsOHM: string;
    authority: string;
    sushiRouter: string;
    uniRouter: string;
    migrator: string;
    gOHM: string;
}