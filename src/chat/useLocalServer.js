import { useEffect, useState } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

/**
 * Connect an in-process MCP server to the chat package.
 * The server is created once; tools read mutable app state lazily.
 */
export function useLocalServer(build, name) {
  const [local, setLocal] = useState([]);

  useEffect(() => {
    let disposed = false;
    let client;
    let server;

    (async () => {
      try {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        server = build();
        await server.connect(serverTransport);
        client = new Client({ name: `${name}-bridge`, version: '1.0.0' });
        await client.connect(clientTransport);
        if (disposed) {
          await client.close();
          await server.close?.();
          return;
        }
        setLocal([{ name, client }]);
      } catch (error) {
        console.error(`Failed to initialise ${name} AI tool server`, error);
        if (!disposed) setLocal([]);
      }
    })();

    return () => {
      disposed = true;
      setLocal([]);
      client?.close().catch(() => {});
      Promise.resolve(server?.close?.()).catch(() => {});
    };
    // Build once; tool handlers read the current controller lazily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return local;
}
