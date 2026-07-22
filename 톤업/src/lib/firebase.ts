import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

function getValidValue(envVal: string | undefined, backupVal: string): string {
  if (!envVal) return backupVal;
  const val = envVal.trim();
  const isPlaceholder =
    val === "" ||
    val === "YOUR_FIREBASE_API_KEY" ||
    val === "your-project-id" ||
    val === "your-project.firebaseapp.com" ||
    val === "your-project.appspot.com" ||
    val === "1234567890" ||
    val.includes("XXXXXXXX") ||
    val.includes("YYYYYYYY");
  return isPlaceholder ? backupVal : val;
}

const config = {
  apiKey: getValidValue(import.meta.env.VITE_FIREBASE_API_KEY, firebaseConfig.apiKey),
  authDomain: getValidValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, firebaseConfig.authDomain),
  projectId: getValidValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, firebaseConfig.projectId),
  storageBucket: getValidValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, firebaseConfig.storageBucket),
  messagingSenderId: getValidValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, firebaseConfig.messagingSenderId),
  appId: getValidValue(import.meta.env.VITE_FIREBASE_APP_ID, firebaseConfig.appId),
};

const app = initializeApp(config);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with optional database ID from config or env
const firestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DB_ID || firebaseConfig.firestoreDatabaseId;
const db = initializeFirestore(app, {}, firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: When the application initially boots, call getFromServer to test the connection.
async function testConnection() {
  try {
    const { doc, getDocFromServer } = await import("firebase/firestore");
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export { auth, googleProvider, db, signInWithPopup, signOut };
