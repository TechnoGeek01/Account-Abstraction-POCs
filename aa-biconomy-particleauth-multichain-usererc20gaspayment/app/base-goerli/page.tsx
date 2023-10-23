"use client";
import { ParticleAuthModule, ParticleProvider } from "@biconomy/particle-auth";
import { useState } from "react";
import { IBundler, Bundler } from "@biconomy/bundler";
import {
  BiconomySmartAccountConfig,
  BiconomySmartAccount,
  DEFAULT_ENTRYPOINT_ADDRESS,
} from "@biconomy/account";
import { ethers } from "ethers";
import { ChainId } from "@biconomy/core-types";
import {
  IPaymaster,
  BiconomyPaymaster,
  IHybridPaymaster,
  PaymasterMode,
  SponsorUserOperationDto,
  PaymasterFeeQuote,
} from "@biconomy/paymaster";
import abi from "../../utils/abi.json";
import { toast, ToastContainer } from "react-toastify";

const erc20Address = "0x76cc01769aecdb6027149f2d85c5e05df72b30d1";

const Minter: React.FC = () => {
  const [smartAccountAddress, setSmartAccountAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [smartAccount, setSmartAccount] = useState<BiconomySmartAccount | null>(
    null
  );
  const [provider, setProvider] = useState<ethers.providers.Provider | null>(
    null
  );

  const particle = new ParticleAuthModule.ParticleNetwork({
    projectId: "bb8d58f8-0d3c-4306-a5f1-6cc7aa73b012",
    clientKey: "c9rwyb2a3pQhHapL1EphoNKYnFsVQkAEHgWP5TRm",
    appId: "bd23aa64-ef27-4054-a823-25aa32d903a4",
    wallet: {
      displayWalletEntry: true,
      defaultWalletEntryPosition: ParticleAuthModule.WalletEntryPosition.BR,
    },
  });

  const bundler: IBundler = new Bundler({
    // get from biconomy dashboard https://dashboard.biconomy.io/
    bundlerUrl: process.env.NEXT_PUBLIC_BASE_GOERLI_BUNDLER_URL || "",
    chainId: ChainId.BASE_GOERLI_TESTNET, // or any supported chain of your choice
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
  });

  const paymaster: IPaymaster = new BiconomyPaymaster({
    // get from biconomy dashboard https://dashboard.biconomy.io/
    paymasterUrl: process.env.NEXT_PUBLIC_BASE_GOERLI_PAYMASTER_URL || "",
  });

  const connect = async () => {
    try {
      setLoading(true);
      const userInfo = await particle.auth.login();
      console.log("Logged in user:", userInfo);
      const particleProvider = new ParticleProvider(particle.auth);
      console.log({ particleProvider });
      const web3Provider = new ethers.providers.Web3Provider(
        particleProvider,
        "any"
      );
      setProvider(web3Provider);
      const biconomySmartAccountConfig: BiconomySmartAccountConfig = {
        signer: web3Provider.getSigner(),
        chainId: ChainId.BASE_GOERLI_TESTNET,
        bundler: bundler,
        paymaster: paymaster,
      };
      let biconomySmartAccount = new BiconomySmartAccount(
        biconomySmartAccountConfig
      );
      biconomySmartAccount = await biconomySmartAccount.init();
      setSmartAccountAddress(
        await biconomySmartAccount.getSmartAccountAddress()
      );
      setSmartAccount(biconomySmartAccount);
      setLoading(false);
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
        toast.info("Minting and transfer Token...", {
          position: "top-right",
          autoClose: 15000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
        const minTx = await contract.populateTransaction.mint(
          smartAccountAddress,
          1000000000000000
        );
        const transferTx = await contract.populateTransaction.transfer(
          "0x0EE0BaE6D665F9435be79cdB6Dd2a34BFF62E1Ed",
          100000000000000
        );
        console.log("mintTx data", minTx.data);
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
        console.log({ partialUserOp });
        const biconomyPaymaster =
          smartAccount.paymaster as IHybridPaymaster<SponsorUserOperationDto>;

        const feeQuotesResponse =
          await biconomyPaymaster.getPaymasterFeeQuotesOrData(partialUserOp, {
            mode: PaymasterMode.ERC20,
            tokenList: [""],
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
        const userOpResponse = await smartAccount.sendUserOp(finalUserOp);
        console.log("userOpHash", userOpResponse);
        const { receipt } = await userOpResponse.wait(1);
        console.log("txHash", receipt.transactionHash);
        toast.success(
          `Success! Here is your transaction:${receipt.transactionHash} `,
          {
            position: "top-right",
            autoClose: 18000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          }
        );
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
          Chain ID: {`${ChainId.BASE_GOERLI_TESTNET}`}
        </h2>
        <h2 className="text-xl font-bold">
          Chain Name: {`${ChainId[ChainId.BASE_GOERLI_TESTNET]}`}
        </h2>
      </div>

      {smartAccountAddress && (
        <div className="flex flex-col justify-center left-0">
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
          Mint and transfer Erc20 Token -&gt; GasLess mode
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
