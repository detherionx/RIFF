"""Wire contracts mirror lib/types.ts. Unknown fields are rejected."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Skill = Literal['strings', 'independence', 'theory', 'intervals', 'rhythm', 'arpeggios', 'transitions', 'muting', 'performance']
Percent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Text = Annotated[str, Field(min_length=1, max_length=500)]
Count = Annotated[int, Field(ge=0, le=1_000_000)]


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Evidence(Contract):
    diagnostic: Literal['input', 'timing', 'practice'] | None = None
    matched: Count | None = None
    expected: Count | None = None
    observed: Count | None = None
    confidence: Literal['high', 'medium', 'low']
    score: Percent | None
    pitchAccuracy: Percent | None
    timingMs: Annotated[float, Field(ge=0, le=60_000)] | None
    missed: Count
    extra: Count
    consistency: Percent | None
    weakestTransition: Annotated[int, Field(ge=0, le=10_000)] | None = None
    message: Text

    @model_validator(mode='before')
    @classmethod
    def diagnostic_fields_are_omitted_or_present(cls, value):
        if isinstance(value, dict) and any(
            key in value and value[key] is None
            for key in ('diagnostic', 'matched', 'expected', 'observed')
        ):
            raise ValueError('Optional diagnostic fields must be omitted rather than null')
        return value


class Attempt(Contract):
    id: Annotated[str, Field(min_length=1, max_length=100)]
    exerciseId: Annotated[str, Field(min_length=1, max_length=100)]
    skill: Skill
    at: datetime
    bpm: Annotated[float, Field(ge=0, le=300)]
    evidence: Evidence
    seconds: Annotated[float, Field(ge=0, le=86_400)]


class Mastery(Contract):
    skill: Skill
    value: Percent
    attempts: Count
    streak: Count
    bestBpm: Annotated[float, Field(ge=0, le=300)]
    lastPracticed: datetime | None
    reviewAt: datetime | None
    errors: Annotated[list[Text], Field(max_length=20)]


class Profile(Contract):
    instrument: Literal['electric', 'acoustic']
    experience: Literal['new', 'returning']
    styles: Annotated[list[Text], Field(max_length=12)]
    goal: Text
    minutes: Annotated[int, Field(ge=1, le=180)]


class Progress(Contract):
    version: Literal[1]
    profile: Profile | None
    attempts: Annotated[list[Attempt], Field(max_length=500)]
    mastery: dict[Skill, Mastery]

    @model_validator(mode='after')
    def consistent_keys(self):
        if any(key != value.skill for key, value in self.mastery.items()):
            raise ValueError('Mastery key must equal its skill')
        if len({attempt.id for attempt in self.attempts}) != len(self.attempts):
            raise ValueError('Attempt ids must be unique')
        return self


class ProgressWrite(Contract):
    progress: Progress


class ProgressRead(Contract):
    progress: Progress | None


class Session(Contract):
    token: str
