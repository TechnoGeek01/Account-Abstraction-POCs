import Link from "next/link";

const Minter: React.FC = () => {
  return (
    <>
      <div className="flex flex-col gap-5 ">
        <Link href={"/polygon-mumbai"}>
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            polygon mumbai
          </button>
        </Link>
        <Link href={"/arbitrum-goerli"}>
          <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            arbitrum goerli
          </button>
        </Link>
        <Link href={"/base-goerli"}>
          <button className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
            base goerli
          </button>
        </Link>
      </div>
    </>
  );
};

export default Minter;
