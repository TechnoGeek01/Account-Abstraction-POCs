"use client";
import { useState, useEffect } from "react";
import { Wallet, providers, ethers } from "ethers";
import abi from "../../utils/abi.json";
import {
  IHybridPaymaster,
  SponsorUserOperationDto,
  PaymasterMode,
  PaymasterFeeQuote,
} from "@biconomy/paymaster";

import { IPaymaster, BiconomyPaymaster } from "@biconomy/paymaster";
import { IBundler, Bundler } from "@biconomy/bundler";
import {
  BiconomySmartAccountV2,
  DEFAULT_ENTRYPOINT_ADDRESS,
} from "@biconomy/account";
import { ChainId } from "@biconomy/core-types";
import {
  ECDSAOwnershipValidationModule,
  DEFAULT_ECDSA_OWNERSHIP_MODULE,
} from "@biconomy/modules";

import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const erc20Address = "0x76cc01769aecdb6027149f2d85c5e05df72b30d1";

const Minter: React.FC = () => {
  const [minted, setMinted] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string>("");
  const [eoaOwnerAddress, setEoaOwnerAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [smartAccount, setSmartAccount] =
    useState<BiconomySmartAccountV2 | null>(null);
  const [provider, setProvider] = useState<ethers.providers.Provider | null>(
    null
  );

  const bundler: IBundler = new Bundler({
    // get from biconomy dashboard https://dashboard.biconomy.io/
    bundlerUrl: process.env.NEXT_PUBLIC_POLYGON_MUMBAI_BUNDLER_URL || "",
    chainId: ChainId.POLYGON_MUMBAI, // or any supported chain of your choice
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
  });

  const paymaster: IPaymaster = new BiconomyPaymaster({
    // get from biconomy dashboard https://dashboard.biconomy.io/
    paymasterUrl: process.env.NEXT_PUBLIC_POLYGON_MUMBAI_PAYMASTER_URL || "",
  });

  const connect = async () => {
    const { ethereum } = window;

    try {
      const provider = new ethers.providers.Web3Provider(ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const eoaOwner = await signer.getAddress();
      console.log(signer);
      const ownerShipModule = await ECDSAOwnershipValidationModule.create({
        signer: signer,
        moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE,
      });
      let biconomySmartAccount = await BiconomySmartAccountV2.create({
        chainId: ChainId.POLYGON_MUMBAI,
        bundler: bundler,
        paymaster: paymaster,
        entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
        defaultValidationModule: ownerShipModule,
        activeValidationModule: ownerShipModule,
      });
      const smartAccountAddress =
        await biconomySmartAccount.getAccountAddress();
      setSmartAccountAddress(smartAccountAddress);
      setEoaOwnerAddress(eoaOwner);
      setSmartAccount(biconomySmartAccount);
      setProvider(provider);
      console.log(smartAccountAddress);
      console.log(erc20Address);
      console.log(biconomySmartAccount);
      console.log("provider", provider);
    } catch (error) {
      console.error(error);
    }
  };

  const MintAndTransfer = async () => {
    const contract = new ethers.Contract(erc20Address, abi, provider);

    if (
      smartAccount !== null &&
      smartAccountAddress !== null &&
      provider !== null
    ) {
      try {
        const minTx = await contract.populateTransaction.mint(
          smartAccountAddress,
          1000000000000000
        );
        const transferTx = await contract.populateTransaction.transfer(
          "0x0EE0BaE6D665F9435be79cdB6Dd2a34BFF62E1Ed",
          100000000000000
        );
        console.log("mintTx data", minTx.data);
        console.log("transferTx data", transferTx.data);
        const tx1 = {
          to: erc20Address,
          data: minTx.data,
        };
        const tx2 = {
          to: erc20Address,
          data: transferTx.data,
        };
        console.log("here before userop");
        let partialUserOp = await smartAccount.buildUserOp([tx1, tx2]);
        const biconomyPaymaster =
          smartAccount.paymaster as IHybridPaymaster<SponsorUserOperationDto>;

        const feeQuotesResponse =
          await biconomyPaymaster.getPaymasterFeeQuotesOrData(partialUserOp, {
            mode: PaymasterMode.ERC20,
            tokenList: ["0xda5289fcaaf71d52a80a254da614a192b693e977"],
          });

        const feeQuotes = feeQuotesResponse.feeQuotes as PaymasterFeeQuote[];
        const spender = feeQuotesResponse.tokenPaymasterAddress || "";
        const usdcFeeQuotes = feeQuotes[0];

        let finalUserOp = await smartAccount.buildTokenPaymasterUserOp(
          partialUserOp,
          {
            feeQuote: usdcFeeQuotes,
            spender: spender,
            maxApproval: false,
          }
        );

        let paymasterServiceData = {
          mode: PaymasterMode.ERC20,
          feeTokenAddress: usdcFeeQuotes.tokenAddress,
          calculateGasLimits: true, // Always recommended and especially when using token paymaster
        };

        try {
          const paymasterAndDataWithLimits =
            await biconomyPaymaster.getPaymasterAndData(
              finalUserOp,
              paymasterServiceData
            );
          finalUserOp.paymasterAndData =
            paymasterAndDataWithLimits.paymasterAndData;
          if (
            paymasterAndDataWithLimits.callGasLimit &&
            paymasterAndDataWithLimits.verificationGasLimit &&
            paymasterAndDataWithLimits.preVerificationGas
          ) {
            // Returned gas limits must be replaced in your op as you update paymasterAndData.
            // Because these are the limits paymaster service signed on to generate paymasterAndData
            // If you receive AA34 error check here..

            finalUserOp.callGasLimit = paymasterAndDataWithLimits.callGasLimit;
            finalUserOp.verificationGasLimit =
              paymasterAndDataWithLimits.verificationGasLimit;
            finalUserOp.preVerificationGas =
              paymasterAndDataWithLimits.preVerificationGas;
          }
        } catch (e) {
          console.log("error received ", e);
        }
        console.log({ finalUserOp });

        const userOpResponse = await smartAccount.sendUserOp(finalUserOp);
        console.log("userOpHash", userOpResponse);
        const { receipt } = await userOpResponse.wait(1);
        console.log("txHash", receipt.transactionHash);
      } catch (err: any) {
        console.error(err);
        console.log(err);
      }
    } else {
      console.log(smartAccountAddress);
      console.log(provider);
      console.log(smartAccount);
      toast.error("Please connect your wallet", {
        position: "top-right",
        autoClose: 18000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
    }
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold">
          Chain ID: {`${ChainId.POLYGON_MUMBAI}`}
        </h2>
        <h2 className="text-xl font-bold">
          Chain Name: {`${ChainId[ChainId.POLYGON_MUMBAI]}`}
        </h2>
      </div>

      {eoaOwnerAddress && smartAccountAddress && (
        <div className="flex flex-col justify-center left-0">
          <h1 className="text-xl font-bold">
            EOA Owner: {`${eoaOwnerAddress}`}{" "}
          </h1>
          <h2 className="text-xl font-bold">
            Smart Account: {`${smartAccountAddress}`}{" "}
          </h2>
        </div>
      )}

      <div className="flex flex-col h-full w-full justify-center gap-5">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full w-52"
          onClick={connect}
        >
          Connect metamask
        </button>
        <button
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full w-52"
          onClick={MintAndTransfer}
        >
          Mint and transfer ERC20 Token -&gt; erc20 payment mode
        </button>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
};

export default Minter;
