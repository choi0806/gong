import { Brand } from "@/components/brand";
import { LoadingScene } from "@/components/mascot";

export default function Loading() {
  return <main className="page-loading"><Brand /><LoadingScene phase="새로운 기회를 만날 준비를 하고 있어요" /></main>;
}
