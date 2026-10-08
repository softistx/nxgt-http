import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A KSUID: 27 characters of base62, at most `aWgEPTl1tmebfsQzFP4bxwgy80V` (160
 * bits). The alphabet is in ASCII order and the length fixed, so the pattern
 * bounds the value digit by digit.
 *
 * Specified by https://github.com/segmentio/ksuid.
 */
@friendlyName("KSUID")
@format("ksuid")
@pattern("^(?:[0-9A-Z][0-9A-Za-z]{26}|a[0-9A-V][0-9A-Za-z]{25}|aW[0-9A-Za-f][0-9A-Za-z]{24}|aWg[0-9A-D][0-9A-Za-z]{23}|aWgE[0-9A-O][0-9A-Za-z]{22}|aWgEP[0-9A-S][0-9A-Za-z]{21}|aWgEPT[0-9A-Za-k][0-9A-Za-z]{20}|aWgEPTl[0][0-9A-Za-z]{19}|aWgEPTl1[0-9A-Za-s][0-9A-Za-z]{18}|aWgEPTl1t[0-9A-Za-l][0-9A-Za-z]{17}|aWgEPTl1tm[0-9A-Za-d][0-9A-Za-z]{16}|aWgEPTl1tme[0-9A-Za][0-9A-Za-z]{15}|aWgEPTl1tmeb[0-9A-Za-e][0-9A-Za-z]{14}|aWgEPTl1tmebf[0-9A-Za-r][0-9A-Za-z]{13}|aWgEPTl1tmebfs[0-9A-P][0-9A-Za-z]{12}|aWgEPTl1tmebfsQ[0-9A-Za-y][0-9A-Za-z]{11}|aWgEPTl1tmebfsQz[0-9A-E][0-9A-Za-z]{10}|aWgEPTl1tmebfsQzF[0-9A-O][0-9A-Za-z]{9}|aWgEPTl1tmebfsQzFP[0-3][0-9A-Za-z]{8}|aWgEPTl1tmebfsQzFP4[0-9A-Za][0-9A-Za-z]{7}|aWgEPTl1tmebfsQzFP4b[0-9A-Za-w][0-9A-Za-z]{6}|aWgEPTl1tmebfsQzFP4bx[0-9A-Za-v][0-9A-Za-z]{5}|aWgEPTl1tmebfsQzFP4bxw[0-9A-Za-f][0-9A-Za-z]{4}|aWgEPTl1tmebfsQzFP4bxwg[0-9A-Za-x][0-9A-Za-z]{3}|aWgEPTl1tmebfsQzFP4bxwgy[0-7][0-9A-Za-z]{2}|aWgEPTl1tmebfsQzFP4bxwgy80[0-9A-U]|aWgEPTl1tmebfsQzFP4bxwgy80V)$")
@extension("x-nxgt-scalar", "KSUID")
scalar ksuid extends string;
