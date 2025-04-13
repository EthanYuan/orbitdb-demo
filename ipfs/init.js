import { createHelia } from "helia";
import { createLibp2p } from "libp2p";
import { LevelBlockstore } from "blockstore-level";
import { promises as fs } from "fs";
import path from "path";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { generateKeyPair, privateKeyFromRaw } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id'

const BaseLibp2pOptions = {
  peerDiscovery: [
    mdns(),
    bootstrap({
      list: [
        // PUBLIC_BOOTSTRAP
        "/ip4/35.220.212.56/tcp/4001/p2p/12D3KooWJ6MTkNM8Bu8DzNiRm1GY3Wqh8U8Pp1zRWap6xY3MvsNw",

        // IPFS_OFFICIAL_BOOTSTRAPS
        "/dnsaddr/va1.bootstrap.libp2p.io/p2p/12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8",
        "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
        "/ip4/104.131.131.82/udp/4001/quic-v1/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",

        // LIBP2P_BOOTSTRAP
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWQiJMV63WiHBbmdZr3jPrr7ZrH1WAM5VTiZ7bSk2fwzvm",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWEzx6rCWrb1R3dAk6urW6X1XH3NwQZz9fktZu4rhQa3j3",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWD71WtxGTVKa2EgaX21kh2RXHHyNwX6u1k7bTWbtSA3UQ",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWEtp8K2npfkiZBVG1ELvLyBrHrA4rdToZ5znniS6T7Gbn",
      ],
      interval: 10000, // 默认10s查一次
    }),
  ],
  transports: [tcp(), webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    pubsub: gossipsub({
      // neccessary to run a single peer
      allowPublishToZeroTopicPeers: true,
    }),
    identify: identify(),
  },
};

export const initIPFSInstance = async (dir, tcpPort = '0', wsPort = '0') => {
  const blockstore = new LevelBlockstore(dir)
  const peerIdPath = path.join(dir, 'full_key.raw')

  let privateKey

  try {
    console.log('Loading existing PeerId...')
    const loadedKeyBytes = await fs.readFile(peerIdPath);
    const restoredKey = await privateKeyFromRaw(loadedKeyBytes);
    privateKey = restoredKey;
    const peerId = await peerIdFromPrivateKey(privateKey)    
    console.log(`Loaded PeerId:`, peerId)
  } catch (err) {
    console.log('No existing PeerId found, generating new one...')

    privateKey = await generateKeyPair('Ed25519')
    const peerId = await peerIdFromPrivateKey(privateKey)    
    console.log(`Generated new PeerId:`, peerId)

    await fs.writeFile(peerIdPath, privateKey.raw)
  }

  const libp2pConfig = {
    ...BaseLibp2pOptions,
    privateKey,
    addresses: {         
      listen: [
        `/ip4/0.0.0.0/tcp/${tcpPort}`,
        `/ip4/0.0.0.0/tcp/${wsPort}/ws`
      ],
    },
  };

  const libp2p = await createLibp2p(libp2pConfig)

  return createHelia({ libp2p, blockstore })
}

