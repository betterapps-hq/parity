import { describeProjectDoc } from "@parity-app/multiplayer/testing"
import { loroProvider, loroReplicas } from "./loro-provider.ts"

describeProjectDoc(loroProvider, { replicas: loroReplicas })
