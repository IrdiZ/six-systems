"""Synthetic people. Every BSN passes the Dutch 11-proof; none belongs to anyone."""

import random
from dataclasses import dataclass
from datetime import date

from faker import Faker

PREFIXES = ("van", "de", "van de", "van den", "van der", "den", "ter", "te")


def make_bsn(rng: random.Random) -> str:
    while True:
        digits = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(7)]
        check = sum(w * d for w, d in zip(range(9, 1, -1), digits)) % 11
        if check <= 9:
            return "".join(map(str, digits + [check]))


def valid_bsn(bsn: str) -> bool:
    if len(bsn) != 9 or not bsn.isdigit():
        return False
    weights = list(range(9, 1, -1)) + [-1]
    return sum(w * int(d) for w, d in zip(weights, bsn)) % 11 == 0


@dataclass
class Patient:
    pid: str
    bsn: str
    given: str
    prefix: str  # Dutch tussenvoegsel, e.g. "van den"
    surname: str
    dob: date
    sex: str
    mrn: str  # hospital record number, what the imaging archive knows
    path: str = ""

    @property
    def family(self) -> str:
        return f"{self.prefix} {self.surname}".strip()

    @property
    def display(self) -> str:
        return f"{self.given} {self.family}"


def make_patients(rng: random.Random, n: int) -> list[Patient]:
    fake = Faker("nl_NL")
    fake.seed_instance(rng.randint(0, 10**6))
    seen = set()
    patients = []
    while len(patients) < n:
        sex = rng.choice("MF")
        given = fake.first_name_male() if sex == "M" else fake.first_name_female()
        raw = fake.last_name()
        # Faker's nl_NL surnames sometimes carry a prefix already; split it out.
        prefix, surname = "", raw
        for p in sorted(PREFIXES, key=len, reverse=True):
            if raw.lower().startswith(p + " "):
                prefix, surname = raw[: len(p)].lower(), raw[len(p) + 1 :]
                break
        if not prefix and rng.random() < 0.35:
            prefix = rng.choice(PREFIXES)
        key = (given, surname)
        if key in seen:
            continue
        seen.add(key)
        dob = date(rng.randint(1941, 1985), rng.randint(1, 12), rng.randint(1, 28))
        patients.append(
            Patient(
                pid=f"P{len(patients) + 1:03d}",
                bsn=make_bsn(rng),
                given=given,
                prefix=prefix,
                surname=surname,
                dob=dob,
                sex=sex,
                mrn=str(rng.randint(1_000_000, 9_999_999)),
            )
        )
    return patients
