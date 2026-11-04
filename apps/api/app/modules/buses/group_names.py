def normalize_group_name(name: str) -> str:
    return " ".join(name.split()).casefold()
