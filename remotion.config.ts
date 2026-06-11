import { Config } from "@remotion/cli/config";

// 4K 24fps — matches Fable's output spec
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(18);
