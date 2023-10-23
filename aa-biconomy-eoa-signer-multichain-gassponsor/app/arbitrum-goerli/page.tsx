"use client";
import { useState, useEffect } from "react";
import { Wallet, providers, ethers } from "ethers";
import abi from "../../utils/abi.json";
import {
  IHybridPaymaster,
  SponsorUserOperationDto,
  PaymasterMode,
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

const erc20Address = "0x0ea80083dfd7c3534b6176b6042480638ef80420";

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
    bundlerUrl: process.env.NEXT_PUBLIC_ARBITRUM_GOERLI_BUNDLER_URL || "",
    chainId: ChainId.ARBITRUM_GOERLI_TESTNET, // or any supported chain of your choice
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
  });

  const paymaster: IPaymaster = new BiconomyPaymaster({
    // get from biconomy dashboard https://dashboard.biconomy.io/
    paymasterUrl: process.env.NEXT_PUBLIC_ARBITRUM_GOERLI_PAYMASTER_URL || "",
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
        chainId: ChainId.ARBITRUM_GOERLI_TESTNET,
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
        let userOp = await smartAccount.buildUserOp([tx1, tx2]);
        userOp.verificationGasLimit = 60000;
        console.log({ userOp });
        const biconomyPaymaster =
          smartAccount.paymaster as IHybridPaymaster<SponsorUserOperationDto>;
        let paymasterServiceData: SponsorUserOperationDto = {
          mode: PaymasterMode.SPONSORED,
          smartAccountInfo: {
            name: "BICONOMY",
            version: "2.0.0",
          },
        };
        const paymasterAndDataResponse =
          await biconomyPaymaster.getPaymasterAndData(
            userOp,
            paymasterServiceData
          );

        userOp.paymasterAndData = paymasterAndDataResponse.paymasterAndData;
        const userOpResponse = await smartAccount.sendUserOp(userOp);
        console.log("userOpHash", userOpResponse);
        const { receipt } = await userOpResponse.wait(1);
        console.log("txHash", receipt.transactionHash);
        setMinted(true);
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
        console.error(err.message);
        console.log(err.message);
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
          Chain ID: {`${ChainId.ARBITRUM_GOERLI_TESTNET}`}
        </h2>
        <h2 className="text-xl font-bold">
          Chain Name: {`${ChainId[ChainId.ARBITRUM_GOERLI_TESTNET]}`}
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
