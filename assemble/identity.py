"""Patient matching. BSN first; hospital number via the EHR; name + birth date as a last resort."""

import re


def norm_name(family: str) -> str:
    """'van den Berg', 'Berg, van den' and 'VANDENBERG' all become 'vandenberg'."""
    if "," in family:
        surname, prefix = [s.strip() for s in family.split(",", 1)]
        family = f"{prefix} {surname}"
    return re.sub(r"[^a-z]", "", family.lower())


class IdentityIndex:
    def __init__(self) -> None:
        self.by_mrn: dict[str, str] = {}
        self.by_name_dob: dict[tuple[str, str], str] = {}
        self.people: dict[str, dict] = {}

    def learn(self, bsn: str, mrn: str | None, family: str, given: str, dob: str) -> None:
        if mrn:
            self.by_mrn[mrn] = bsn
        self.by_name_dob[(norm_name(family), dob)] = bsn
        self.people.setdefault(bsn, {"family": family, "given": given, "dob": dob, "mrn": mrn})

    def from_mrn(self, mrn: str) -> str | None:
        return self.by_mrn.get(mrn)

    def from_name_dob(self, family: str, dob: str) -> str | None:
        return self.by_name_dob.get((norm_name(family), dob))
