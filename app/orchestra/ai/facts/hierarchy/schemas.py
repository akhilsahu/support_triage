from typing import Optional
from pydantic import BaseModel, Field

class ProductNode(BaseModel):
    product_name: str = Field(description="The canonical, standardized name of the product.")
    parent_product: Optional[str] = Field(
        default=None, 
        description="The canonical name of the parent product, if this is a variant. Otherwise null."
    )
    aliases: list[str] = Field(
        default_factory=list, 
        description="List of alternative names or aliases for this product found in the input subjects."
    )

class HierarchyTree(BaseModel):
    nodes: list[ProductNode]
