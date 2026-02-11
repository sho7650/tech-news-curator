from pydantic import BaseModel, ConfigDict


class AppBaseModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        str_max_length=65536,
        extra="forbid",
        validate_default=True,
    )
