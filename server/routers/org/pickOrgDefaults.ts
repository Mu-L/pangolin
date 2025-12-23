import { Request, Response, NextFunction } from "express";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { getNextAvailableOrgSubnet } from "@server/lib/ip";
import config from "@server/lib/config";

export type PickOrgDefaultsResponse = {
    subnet: string;
    utilitySubnet: string;
};

export async function pickOrgDefaults(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // TODO: Why would each org have to have its own subnet?
        // const subnet = await getNextAvailableOrgSubnet();
        // Just hard code the subnet for now for everyone
        const subnet = config.getRawConfig().orgs.subnet_group;
        const utilitySubnet = config.getRawConfig().orgs.utility_subnet_group;

        return response<PickOrgDefaultsResponse>(res, {
            data: {
                subnet: subnet,
                utilitySubnet: utilitySubnet
            },
            success: true,
            error: false,
            message: "Organization defaults created successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
