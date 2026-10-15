// Files the customer uploads in the portal, kept in IndexedDB so the
// accountant tab (same origin) can open the real thing. Keyed by file name,
// which is all a request stores. Seeded demo files have no blob; the preview
// renders them from the data instead.
const DB = "ledger-ai-files"
const STORE = "files"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveFile(file: File) {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(file, file.name)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Private mode or storage blocked: the name still travels with the
    // reply, and the preview falls back to a rendered document.
  }
}

export async function loadFile(name: string): Promise<Blob | undefined> {
  try {
    const db = await open()
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(name)
      req.onsuccess = () => resolve(req.result as Blob | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return blob
  } catch {
    return undefined
  }
}
